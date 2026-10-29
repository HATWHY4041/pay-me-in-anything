// GET /api/availability?amt=50[&assets=id1,id2]
// Which tokens can pay an invoice of this size right now. NEAR Intents pauses chains, sets temporary
// minimums and loses liquidity from time to time, so the pay page asks this before the payer picks anything.
// Each token gets a free "dry" quote (no deposit address, no waiting for solvers), so the check takes seconds.
import { send, listTokens, quoteBody, requestQuote, errorMessage, explainQuoteError } from "./_lib.js";

const PROBE_ACCOUNT = "wrap.near"; // any valid NEAR account; dry quotes never send anything
const CONCURRENCY = 40;

async function check(token, amountUsd) {
  const body = quoteBody({
    originAsset: token.assetId, amountUsd, recipient: PROBE_ACCOUNT,
    refundTo: PROBE_ACCOUNT, refundType: "INTENTS", dry: true, waitMs: 0,
  });
  try {
    const { status, data } = await requestQuote(body, { retrySlow: false });
    if (data?.quote) return { ok: true };
    const message = errorMessage(data, "");
    if (/only ORIGIN_CHAIN refundType/i.test(message)) return { ok: true }; // fine with a real refund address
    if (!status || status === 429 || status >= 500) return { ok: null }; // couldn't tell: let the payer try
    return { ok: false, ...explainQuoteError(message) };
  } catch {
    return { ok: null };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Use GET" });
  const params = new URL(req.url, "http://local").searchParams;
  const amt = Math.round(Number(params.get("amt")) * 100) / 100;
  if (!Number.isFinite(amt) || amt < 0.5 || amt > 100000) {
    return send(res, 400, { error: "The amount must be between $0.50 and $100,000." });
  }
  const only = new Set(String(params.get("assets") || "").split(",").filter(Boolean).slice(0, 40));

  let tokens;
  try {
    tokens = await listTokens();
  } catch {
    return send(res, 502, { error: "NEAR Intents is not reachable right now. Try again in a minute." });
  }
  if (only.size) tokens = tokens.filter((t) => only.has(t.assetId));

  const assets = {};
  let next = 0;
  async function worker() {
    while (next < tokens.length) {
      const t = tokens[next++];
      assets[t.assetId] = await check(t, amt);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tokens.length) }, worker));
  return send(res, 200, { amt, checkedAt: new Date().toISOString(), assets }, 300);
}
