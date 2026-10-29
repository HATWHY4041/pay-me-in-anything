// POST /api/quote — asks NEAR Intents for a one-time deposit address.
// The payer sends their token there; Intents swaps and delivers exactly `amountUsd` USDC to the receiver on NEAR.
import { send, readJson, isNearAccount, errorMessage, quoteBody, requestQuote, explainQuoteError } from "./_lib.js";

const QUOTE_MINUTES = 30;

export default async function handler(req, res) {
  let input;
  if (req.method === "GET") {
    // GET is a price preview only: it never returns a deposit address.
    input = { ...Object.fromEntries(new URL(req.url, "http://local").searchParams), dry: true };
  } else if (req.method === "POST") {
    try {
      input = await readJson(req);
    } catch {
      return send(res, 400, { error: "The request body is not valid JSON." });
    }
  } else {
    return send(res, 405, { error: "Use GET for a preview or POST for a payment address" });
  }

  const { originAsset, recipient, refundTo } = input;
  const amountUsd = Number(input.amountUsd);
  const dry = req.method === "GET" || input.dry === true;

  if (!originAsset || typeof originAsset !== "string") return send(res, 400, { error: "Pick a token to pay with." });
  if (!isNearAccount(recipient)) return send(res, 400, { error: "This payment link has an invalid NEAR account." });
  if (!Number.isFinite(amountUsd) || amountUsd < 0.5 || amountUsd > 100000) {
    return send(res, 400, { error: "The amount must be between $0.50 and $100,000." });
  }
  if (!refundTo || typeof refundTo !== "string" || refundTo.trim().length < 3) {
    return send(res, 400, { error: "Enter your own address on this chain, so a failed payment can be refunded." });
  }

  try {
    const body = quoteBody({ originAsset, amountUsd, recipient, refundTo, dry, waitMs: 4000, minutes: QUOTE_MINUTES });
    const { ok, status, data } = await requestQuote(body);
    if (!ok || !data || !data.quote) {
      const message = errorMessage(data, "NEAR Intents could not quote this payment. Try another token.");
      return send(res, status && status < 500 ? 400 : 502, { error: message, ...explainQuoteError(message) });
    }
    const q = data.quote;
    return send(res, 200, {
      depositAddress: q.depositAddress || null,
      depositMemo: q.depositMemo || null,
      amountIn: q.amountIn,
      amountInFormatted: q.amountInFormatted,
      amountInUsd: q.amountInUsd,
      minAmountIn: q.minAmountIn,
      amountOutFormatted: q.amountOutFormatted,
      amountOutUsd: q.amountOutUsd,
      deadline: q.deadline || body.deadline,
      timeEstimate: q.timeEstimate || null,
    });
  } catch {
    return send(res, 502, { error: "NEAR Intents is not reachable right now. Try again in a minute." });
  }
}
