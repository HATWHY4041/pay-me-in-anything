// GET /api/status?depositAddress=...&depositMemo=... — where a payment is right now.
import { oneClick, send, errorMessage } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Use GET" });
  const url = new URL(req.url, "http://local");
  const depositAddress = url.searchParams.get("depositAddress");
  const depositMemo = url.searchParams.get("depositMemo");
  if (!depositAddress) return send(res, 400, { error: "Missing depositAddress." });

  const qs = new URLSearchParams({ depositAddress });
  if (depositMemo) qs.set("depositMemo", depositMemo);

  try {
    const { ok, status, data } = await oneClick(`/v0/status?${qs}`);
    if (!ok || !data) return send(res, status || 502, { error: errorMessage(data, "Could not check this payment.") });
    const details = data.swapDetails || {};
    return send(res, 200, {
      status: data.status,
      amountInFormatted: details.amountInFormatted || null,
      amountOutFormatted: details.amountOutFormatted || null,
      originTxHashes: (details.originChainTxHashes || []).map((t) => t.hash || t).filter(Boolean),
      destinationTxHashes: (details.destinationChainTxHashes || []).map((t) => t.hash || t).filter(Boolean),
      refundedAmountFormatted: details.refundedAmountFormatted || null,
    });
  } catch {
    return send(res, 502, { error: "NEAR Intents is not reachable right now." });
  }
}
