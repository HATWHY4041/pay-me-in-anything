// The pay page: pick a chain and token, get a one-time address, send, and watch it settle.
(function () {
  const { chainName, isNearAccount, formatUsd, qr, copy, api, store } = window.PMA;
  const $ = (id) => document.getElementById(id);

  // ---- Read the link -------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const link = {
    to: String(params.get("to") || "").trim().toLowerCase(),
    amt: Number(params.get("amt")),
    name: String(params.get("name") || "").trim().slice(0, 60),
    note: String(params.get("for") || "").trim().slice(0, 80),
  };
  if (!isNearAccount(link.to) || !Number.isFinite(link.amt) || link.amt < 0.5 || link.amt > 100000) {
    $("bad-link").hidden = false;
    return;
  }

  $("slip").hidden = false;
  $("payee-name").textContent = `Pay ${link.name || link.to}`;
  $("payee-account").textContent = `Arrives as USDC in ${link.to}`;
  $("amount").textContent = `$${formatUsd(link.amt)}`;
  if (link.note) {
    $("note").textContent = `For ${link.note}`;
    $("note").hidden = false;
  }
  document.title = `Pay ${link.name || link.to} $${formatUsd(link.amt)}`;

  const storeKey = `pma:${link.to}:${link.amt}:${link.note}`;
  const TERMINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);
  let tokens = [];
  let selected = null;
  let quote = null;
  let pollTimer = null;
  let countdownTimer = null;

  // ---- Step 1: chains and tokens ------------------------------------------
  const PREFERRED_CHAINS = ["base", "eth", "arb", "sol", "near", "tron", "bsc", "pol", "op", "btc", "ton"];
  const PREFERRED_TOKENS = ["USDC", "USDT", "ETH", "SOL", "NEAR", "BTC", "TRX", "BNB"];
  const rank = (list, v) => (list.indexOf(v) === -1 ? 99 : list.indexOf(v));

  async function loadTokens() {
    try {
      const data = await api("/api/tokens");
      tokens = data.tokens;
      const chains = [...new Set(tokens.map((t) => t.blockchain))].sort(
        (a, b) => rank(PREFERRED_CHAINS, a) - rank(PREFERRED_CHAINS, b) || chainName(a).localeCompare(chainName(b))
      );
      $("chain").innerHTML = chains.map((c) => `<option value="${c}">${escapeHtml(chainName(c))}</option>`).join("");
      $("chain").disabled = false;
      fillTokens();
    } catch (err) {
      $("choose-error").textContent = `${err.message} Reload the page to try again.`;
      $("chain").innerHTML = "<option>Unavailable</option>";
      $("token").innerHTML = "<option>Unavailable</option>";
    }
  }

  function fillTokens() {
    const chain = $("chain").value;
    const list = tokens
      .filter((t) => t.blockchain === chain)
      .sort((a, b) => rank(PREFERRED_TOKENS, a.symbol) - rank(PREFERRED_TOKENS, b.symbol) || a.symbol.localeCompare(b.symbol));
    $("token").innerHTML = list.map((t) => `<option value="${escapeHtml(t.assetId)}">${escapeHtml(t.symbol)}</option>`).join("");
    $("token").disabled = list.length === 0;
    $("refund-label").textContent = `Your ${chainName(chain)} address`;
    pickToken();
  }

  function pickToken() {
    selected = tokens.find((t) => t.assetId === $("token").value) || null;
    $("get-address").disabled = !selected;
    if (selected && selected.price) {
      const estimate = link.amt / selected.price;
      const digits = estimate >= 100 ? 2 : estimate >= 1 ? 4 : 6;
      $("estimate").innerHTML = `About <strong>${estimate.toLocaleString("en-US", { maximumFractionDigits: digits })} ${escapeHtml(selected.symbol)}</strong>. The exact amount comes with the address.`;
    } else {
      $("estimate").textContent = "";
    }
  }

  $("chain").addEventListener("change", fillTokens);
  $("token").addEventListener("change", pickToken);

  $("choose").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("choose-error").textContent = "";
    const refundTo = $("refund").value.trim();
    if (!selected) return;
    if (refundTo.length < 3) {
      $("choose-error").textContent = `Paste your own ${chainName(selected.blockchain)} address first.`;
      $("refund").focus();
      return;
    }
    const button = $("get-address");
    button.disabled = true;
    button.textContent = "Getting your address…";
    try {
      const q = await api("/api/quote", {
        method: "POST",
        body: { originAsset: selected.assetId, recipient: link.to, refundTo, amountUsd: link.amt, dry: false },
      });
      if (!q.depositAddress) throw new Error("NEAR Intents did not return a deposit address. Try another token.");
      quote = { ...q, symbol: selected.symbol, chain: selected.blockchain, createdAt: Date.now() };
      store.set(storeKey, quote);
      showDeposit();
    } catch (err) {
      $("choose-error").textContent = friendly(err.message);
    } finally {
      button.disabled = false;
      button.textContent = "Get payment address";
    }
  });

  // ---- Step 2: deposit ------------------------------------------------------
  function showDeposit() {
    $("choose").hidden = true;
    $("deposit").hidden = false;
    $("send-amount").textContent = `${quote.amountInFormatted} ${quote.symbol} on ${chainName(quote.chain)}`;
    // Multi-chain wallets show the same token on several networks; sending from the wrong one fails.
    $("network-warn").textContent =
      `Send from the ${chainName(quote.chain)} network only. If your wallet lists ${quote.symbol} more than once, pick the one on ${chainName(quote.chain)}.`;
    $("deposit-address").textContent = quote.depositAddress;
    qr($("deposit-qr"), quote.depositAddress);
    if (quote.depositMemo) {
      $("memo-block").hidden = false;
      $("deposit-memo").textContent = quote.depositMemo;
    }
    setStatus("working", "Waiting for your payment");
    startCountdown();
    poll();
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    const end = Date.parse(quote.deadline);
    const tick = () => {
      const left = end - Date.now();
      if (!Number.isFinite(end)) return ($("countdown").textContent = "");
      if (left <= 0) {
        $("countdown").textContent = "This address has expired. Get a new one before sending.";
        clearInterval(countdownTimer);
        return;
      }
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      $("countdown").textContent = h > 0
        ? `Send within ${h}h ${m}m`
        : `Send within ${m}:${String(s).padStart(2, "0")}`;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  const STATUS_TEXT = {
    PENDING_DEPOSIT: ["working", "Waiting for your payment"],
    KNOWN_DEPOSIT_TX: ["working", "Payment spotted, waiting for confirmation"],
    INCOMPLETE_DEPOSIT: ["bad", "Less than the full amount arrived. Send the rest, or wait for a refund."],
    PROCESSING: ["working", "Payment received, converting to USDC"],
    SUCCESS: ["done", "Paid"],
    REFUNDED: ["bad", "Refunded to your address"],
    FAILED: ["bad", "The payment failed"],
  };

  async function poll() {
    clearTimeout(pollTimer);
    if (!quote) return;
    try {
      const qs = new URLSearchParams({ depositAddress: quote.depositAddress });
      if (quote.depositMemo) qs.set("depositMemo", quote.depositMemo);
      const s = await api(`/api/status?${qs}`);
      const [state, text] = STATUS_TEXT[s.status] || ["working", "Checking your payment"];
      setStatus(state, text);
      if (TERMINAL.has(s.status)) return finish(s);
    } catch {
      setStatus("working", "Reconnecting…");
    }
    pollTimer = setTimeout(poll, 5000);
  }

  function setStatus(state, text) {
    $("status").dataset.state = state;
    $("status-text").textContent = text;
  }

  $("copy-address").addEventListener("click", (e) => copy(quote.depositAddress, e.currentTarget));
  $("copy-memo").addEventListener("click", (e) => copy(quote.depositMemo, e.currentTarget));

  $("submit-tx").addEventListener("click", async (e) => {
    $("tx-error").textContent = "";
    const txHash = $("tx-hash").value.trim();
    if (!txHash) return ($("tx-error").textContent = "Paste the transaction ID from your wallet first.");
    e.currentTarget.disabled = true;
    try {
      await api("/api/submit", {
        method: "POST",
        body: { txHash, depositAddress: quote.depositAddress, depositMemo: quote.depositMemo },
      });
      $("tx-hash").value = "";
      setStatus("working", "Payment spotted, waiting for confirmation");
      poll();
    } catch (err) {
      $("tx-error").textContent = friendly(err.message);
    } finally {
      e.currentTarget.disabled = false;
    }
  });

  $("start-over").addEventListener("click", () => {
    clearTimeout(pollTimer);
    clearInterval(countdownTimer);
    store.remove(storeKey);
    quote = null;
    $("deposit").hidden = true;
    $("memo-block").hidden = true;
    $("choose").hidden = false;
  });

  // ---- Step 3: done -----------------------------------------------------------
  function finish(s) {
    clearInterval(countdownTimer);
    $("deposit").hidden = true;
    $("done").hidden = false;
    const ok = s.status === "SUCCESS";
    $("stamp-word").textContent = ok ? "Paid" : s.status === "REFUNDED" ? "Refunded" : "Failed";
    if (!ok) $("stamp-word").style.color = $("stamp-word").style.borderColor = "var(--alert)";

    const rows = [
      ["To", link.to],
      ["Amount", ok && s.amountOutFormatted ? `${s.amountOutFormatted} USDC` : `$${formatUsd(link.amt)}`],
      ["Paid with", `${s.amountInFormatted || quote.amountInFormatted} ${quote.symbol} on ${chainName(quote.chain)}`],
    ];
    if (link.note) rows.push(["For", link.note]);
    if (Number(s.refundedAmountFormatted) > 0) rows.push(["Refunded", `${s.refundedAmountFormatted} ${quote.symbol}`]);
    rows.push(["Date", new Date().toLocaleString()]);
    if (s.destinationTxHashes && s.destinationTxHashes[0]) {
      rows.push(["NEAR transaction", `<a href="https://nearblocks.io/txns/${encodeURIComponent(s.destinationTxHashes[0])}" target="_blank" rel="noopener">${escapeHtml(s.destinationTxHashes[0].slice(0, 10))}…</a>`]);
    }
    $("receipt").innerHTML = rows
      .map(([k, v]) => `<li><span>${escapeHtml(k)}</span><span>${k === "NEAR transaction" ? v : escapeHtml(v)}</span></li>`)
      .join("");
    $("done-hint").textContent = ok
      ? "Screenshot this receipt for your records."
      : "Nothing was lost: the funds went back to the address you gave.";
    if (ok) store.remove(storeKey);
  }

  // ---- Helpers ---------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function friendly(message) {
    const m = String(message || "");
    if (/refund/i.test(m) && /address|valid/i.test(m)) return "That address doesn't look right for this chain. Check it and try again.";
    if (/amount.*(low|small)|too (low|small)/i.test(m)) return "This amount is too small for this token. Try a stablecoin like USDC.";
    return m || "Something went wrong. Try again.";
  }

  // Resume an unfinished payment after a refresh.
  const saved = store.get(storeKey);
  if (saved && saved.depositAddress && Date.now() - saved.createdAt < 24 * 60 * 60 * 1000) {
    quote = saved;
    showDeposit();
  }
  loadTokens();
})();
