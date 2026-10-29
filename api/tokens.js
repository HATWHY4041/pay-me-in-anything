// GET /api/tokens — every chain and token a payer can pay with, from NEAR Intents.
import { oneClick, send, errorMessage } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Use GET" });
  try {
    const { ok, status, data } = await oneClick("/v0/tokens");
    if (!ok || !Array.isArray(data)) {
      return send(res, status || 502, { error: errorMessage(data, "Could not load tokens from NEAR Intents") });
    }
    const tokens = data
      .filter((t) => t && t.assetId && t.blockchain && t.symbol)
      .map((t) => ({
        assetId: t.assetId,
        blockchain: t.blockchain,
        symbol: t.symbol,
        decimals: t.decimals,
        price: typeof t.price === "number" ? t.price : Number(t.price) || null,
        contractAddress: t.contractAddress || null,
      }));
    return send(res, 200, { tokens }, 120);
  } catch (err) {
    return send(res, 502, { error: "NEAR Intents is not reachable right now. Try again in a minute." });
  }
}
