// GET /api/tokens — every chain and token a payer can pay with, from NEAR Intents.
import { send, listTokens } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Use GET" });
  try {
    return send(res, 200, { tokens: await listTokens() }, 120);
  } catch (err) {
    return send(res, err.status && err.status < 500 ? err.status : 502, {
      error: err.status ? err.message : "NEAR Intents is not reachable right now. Try again in a minute.",
    });
  }
}
