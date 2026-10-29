// Shared helpers for the API routes. Files starting with "_" are not exposed as routes on Vercel.

export const ONECLICK_BASE = process.env.ONECLICK_BASE_URL || "https://1click.chaindefuser.com";

// Native USDC on NEAR. Every payment lands as this token in the receiver's NEAR account.
export const PAYOUT_ASSET =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const PAYOUT_DECIMALS = 6;

// Optional key from https://partners.near-intents.org — without it, 1Click charges a 0.2% fee.
function authHeaders() {
  const jwt = process.env.ONECLICK_JWT;
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

export async function oneClick(path, { method = "GET", body } = {}) {
  const res = await fetch(`${ONECLICK_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { ok: res.ok, status: res.status, data };
}

export function send(res, status, payload, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    cacheSeconds ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` : "no-store"
  );
  res.end(JSON.stringify(payload));
}

// Vercel parses JSON bodies for us; the local server (server.js) does not, so read the stream there.
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// A NEAR account is either a named account (ade.near, shop.tg) or a 64-character implicit hex account.
export function isNearAccount(value) {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(v)) return true;
  if (/^0x[0-9a-f]{40}$/.test(v)) return true; // eth-implicit accounts
  return v.length >= 2 && v.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(v);
}

export function errorMessage(data, fallback) {
  if (!data) return fallback;
  return data.message || data.error || (Array.isArray(data.errors) && data.errors.join(", ")) || fallback;
}

// ---- Quotes ------------------------------------------------------------------

// Every token NEAR Intents lists that can be priced (no price = can't be quoted; deprecated ones are hidden).
export async function listTokens() {
  const { ok, status, data } = await oneClick("/v0/tokens");
  if (!ok || !Array.isArray(data)) {
    const err = new Error(errorMessage(data, "Could not load tokens from NEAR Intents"));
    err.status = status;
    throw err;
  }
  return data
    .filter((t) => t && t.assetId && t.blockchain && t.symbol && Number(t.price) > 0)
    .filter((t) => !/deprecated/i.test(t.symbol))
    .map((t) => ({
      assetId: t.assetId,
      blockchain: t.blockchain,
      symbol: t.symbol,
      decimals: t.decimals,
      price: typeof t.price === "number" ? t.price : Number(t.price) || null,
      contractAddress: t.contractAddress || null,
    }));
}

// The quote request: the receiver always gets exactly `amountUsd` USDC on NEAR (EXACT_OUTPUT).
export function quoteBody({ originAsset, amountUsd, recipient, refundTo, refundType = "ORIGIN_CHAIN", dry, waitMs = 4000, minutes = 30 }) {
  return {
    dry: Boolean(dry),
    swapType: "EXACT_OUTPUT",
    slippageTolerance: 100, // 1%, in basis points
    originAsset,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: PAYOUT_ASSET,
    amount: String(Math.round(amountUsd * 10 ** PAYOUT_DECIMALS)),
    refundTo: String(refundTo).trim(),
    refundType,
    recipient: String(recipient).trim().toLowerCase(),
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    referral: "pay-me-in-anything",
    quoteWaitingTimeMs: waitMs,
  };
}

// Ask 1Click for a quote, fixing the two problems that a second request can solve:
// chains like Stellar need a memo with the deposit, and solvers occasionally don't answer in time.
export async function requestQuote(body, { retrySlow = true } = {}) {
  let r = await oneClick("/v0/quote", { method: "POST", body });
  if (!r.data?.quote && /depositMode/i.test(errorMessage(r.data, ""))) {
    body = { ...body, depositMode: "MEMO" };
    r = await oneClick("/v0/quote", { method: "POST", body });
  }
  if (retrySlow && !r.data?.quote && /failed to get( a)? quote/i.test(errorMessage(r.data, ""))) {
    r = await oneClick("/v0/quote", { method: "POST", body: { ...body, quoteWaitingTimeMs: 8000 } });
  }
  return r;
}

// Turn a 1Click refusal into something we can show and act on.
//   min       the pair works, but only above a (usually temporary) minimum
//   paused    NEAR Intents has switched this pair or chain off for now
//   liquidity nobody is offering to swap this token right now
export function explainQuoteError(message) {
  const m = String(message || "");
  let found = m.match(/minimum swap amount is \$?([\d,]+(?:\.\d+)?)/i) || m.match(/at least \$([\d,]+(?:\.\d+)?)/i);
  if (found) return { kind: "min", minUsd: Number(found[1].replace(/,/g, "")) };
  found = m.match(/too low.*?at least (\d+)\b/i); // given in USDC base units for exact-output quotes
  if (found) return { kind: "min", minUsd: Math.ceil(Number(found[1]) / 10 ** (PAYOUT_DECIMALS - 2)) / 100 };
  if (/not available|not supported/i.test(m)) return { kind: "paused" };
  if (/liquidity|failed to get( a)? quote|no quotes?/i.test(m)) return { kind: "liquidity" };
  return { kind: "other" };
}
