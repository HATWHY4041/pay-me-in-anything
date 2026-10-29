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
