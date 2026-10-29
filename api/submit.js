// POST /api/submit — tells NEAR Intents the payer's transaction hash, so it spots the deposit faster.
import { oneClick, send, readJson, errorMessage } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });
  let input;
  try {
    input = await readJson(req);
  } catch {
    return send(res, 400, { error: "The request body is not valid JSON." });
  }
  const { txHash, depositAddress, depositMemo } = input;
  if (!txHash || !depositAddress) return send(res, 400, { error: "Paste the transaction ID first." });

  const body = { txHash: String(txHash).trim(), depositAddress };
  if (depositMemo) body.memo = depositMemo;

  try {
    const { ok, status, data } = await oneClick("/v0/deposit/submit", { method: "POST", body });
    if (!ok) return send(res, status || 502, { error: errorMessage(data, "NEAR Intents did not accept that transaction ID.") });
    return send(res, 200, { status: data && data.status ? data.status : "KNOWN_DEPOSIT_TX" });
  } catch {
    return send(res, 502, { error: "NEAR Intents is not reachable right now." });
  }
}
