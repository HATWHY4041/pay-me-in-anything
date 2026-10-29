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
  $("amount").parentElement.classList.toggle("long", formatUsd(link.amt).length > 6);
  $("amount").parentElement.classList.toggle("xlong", formatUsd(link.amt).length > 9);
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
  const PREFERRED_CHAINS = ["base", "sol", "arb", "near", "tron", "eth", "bsc", "pol", "op", "btc", "ton", "avax"];
  const PREFERRED_TOKENS = ["USDC", "USDT", "ETH", "SOL", "NEAR", "wNEAR", "BTC", "TRX", "BNB"];
  const rank = (list, v) => (list.indexOf(v) === -1 ? 99 : list.indexOf(v));
  // Live availability from /api/availability: assetId -> { ok: true | false | null, kind, minUsd }
  let avail = null;

  const usable = (t) => !avail || !avail[t.assetId] || avail[t.assetId].ok !== false;
  function why(t) {
    const a = avail && avail[t.assetId];
    if (!a || a.ok !== false) return "";
    if (a.kind === "min") return `min $${formatUsd(a.minUsd).replace(/\.00$/, "")}`;
    if (a.kind === "paused") return "paused right now";
    if (a.kind === "liquidity") return "no liquidity right now";
    return "unavailable right now";
  }
  function chainWhy(chain) {
    const list = tokens.filter((t) => t.blockchain === chain);
    const mins = list.map((t) => avail && avail[t.assetId]).filter((a) => a && a.kind === "min").map((a) => a.minUsd);
    if (mins.length) return `from $${formatUsd(Math.min(...mins)).replace(/\.00$/, "")}`;
    return list.some((t) => avail && avail[t.assetId] && avail[t.assetId].kind === "paused") ? "paused right now" : "unavailable right now";
  }
  const chainOk = (chain) => tokens.some((t) => t.blockchain === chain && usable(t));

  async function loadTokens() {
    try {
      const data = await api("/api/tokens");
      tokens = data.tokens;
    } catch (err) {
      $("choose-error").textContent = `${err.message} Reload the page to try again.`;
      $("chain").innerHTML = "<option>Unavailable</option>";
      $("token").innerHTML = "<option>Unavailable</option>";
      return;
    }
    $("estimate").textContent = `Checking which tokens can pay $${formatUsd(link.amt)} right now…`;
    try {
      avail = (await api(`/api/availability?amt=${link.amt}`)).assets;
    } catch {
      avail = null; // can't tell: offer everything, and handle any refusal when the payer asks for an address
    }
    fillChains();
  }

  function fillChains(keep) {
    const chains = [...new Set(tokens.map((t) => t.blockchain))].sort(
      (a, b) => rank(PREFERRED_CHAINS, a) - rank(PREFERRED_CHAINS, b) || chainName(a).localeCompare(chainName(b))
    );
    const on = chains.filter(chainOk);
    const off = chains.filter((c) => !chainOk(c));
    if (!on.length) {
      $("chain").innerHTML = "<option>Unavailable</option>";
      $("token").innerHTML = "<option>Unavailable</option>";
      $("estimate").textContent = "";
      $("choose-error").textContent = "NEAR Intents can't take any payments of this size right now. Try again in a few minutes.";
      return;
    }
    $("chain").innerHTML =
      on.map((c) => `<option value="${c}">${escapeHtml(chainName(c))}</option>`).join("") +
      (off.length
        ? `<optgroup label="Not available for $${formatUsd(link.amt)} right now">` +
          off.map((c) => `<option value="${c}" disabled>${escapeHtml(chainName(c))} (${escapeHtml(chainWhy(c))})</option>`).join("") +
          "</optgroup>"
        : "");
    $("chain").disabled = false;
    if (keep && on.includes(keep)) $("chain").value = keep;
    fillTokens();
  }

  function fillTokens(keepAsset) {
    const chain = $("chain").value;
    const list = tokens
      .filter((t) => t.blockchain === chain)
      .sort((a, b) => (usable(b) - usable(a)) || rank(PREFERRED_TOKENS, a.symbol) - rank(PREFERRED_TOKENS, b.symbol) || a.symbol.localeCompare(b.symbol));
    $("token").innerHTML = list
      .map((t) => `<option value="${escapeHtml(t.assetId)}"${usable(t) ? "" : " disabled"}>${escapeHtml(t.symbol)}${usable(t) ? "" : ` (${escapeHtml(why(t))})`}</option>`)
      .join("");
    $("token").disabled = !list.some(usable);
    if (keepAsset && list.some((t) => t.assetId === keepAsset && usable(t))) $("token").value = keepAsset;
    $("refund-label").textContent = `Your ${chainName(chain)} address`;
    pickToken();
  }

  function pickToken() {
    selected = tokens.find((t) => t.assetId === $("token").value && usable(t)) || null;
    $("get-address").disabled = !selected;
    $("alts").hidden = true;
    if (selected && selected.price) {
      const estimate = link.amt / selected.price;
      const digits = estimate >= 100 ? 2 : estimate >= 1 ? 4 : 6;
      $("estimate").innerHTML = `About <strong>${estimate.toLocaleString("en-US", { maximumFractionDigits: digits })} ${escapeHtml(selected.symbol)}</strong>. The exact amount comes with the address.`;
    } else {
      $("estimate").textContent = "";
    }
  }

  // Other ways to pay that work right now: the same token on other chains first, then stablecoins.
  function showAlternatives(failed) {
    const picks = tokens
      .filter((t) => t.assetId !== failed.assetId && usable(t))
      .sort((a, b) =>
        (b.symbol === failed.symbol) - (a.symbol === failed.symbol) ||
        rank(PREFERRED_TOKENS, a.symbol) - rank(PREFERRED_TOKENS, b.symbol) ||
        rank(PREFERRED_CHAINS, a.blockchain) - rank(PREFERRED_CHAINS, b.blockchain))
      .slice(0, 4);
    if (!picks.length) return;
    $("alts").innerHTML = `<span>Works right now:</span>` + picks
      .map((t) => `<button type="button" class="alt" data-asset="${escapeHtml(t.assetId)}">${escapeHtml(t.symbol)} <small>${escapeHtml(chainName(t.blockchain))}</small></button>`)
      .join("");
    $("alts").hidden = false;
  }
  $("alts").addEventListener("click", (e) => {
    const b = e.target.closest(".alt");
    if (!b) return;
    const t = tokens.find((x) => x.assetId === b.dataset.asset);
    if (!t) return;
    $("choose-error").textContent = "";
    $("chain").value = t.blockchain;
    fillTokens(t.assetId);
    // The refund address belongs to the old chain, so ask for a new one.
    $("refund").value = "";
    $("refund").focus();
  });

  $("chain").addEventListener("change", () => fillTokens());
  $("token").addEventListener("change", pickToken);

  $("choose").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("choose-error").textContent = "";
    $("alts").hidden = true;
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
    const tried = selected;
    try {
      const q = await api("/api/quote", {
        method: "POST",
        body: { originAsset: tried.assetId, recipient: link.to, refundTo, amountUsd: link.amt, dry: false },
      });
      if (!q.depositAddress) throw new Error("NEAR Intents did not return a deposit address. Try another token.");
      quote = { ...q, symbol: tried.symbol, chain: tried.blockchain, createdAt: Date.now() };
      store.set(storeKey, quote);
      showDeposit();
    } catch (err) {
      const info = err.data || {};
      $("choose-error").textContent = friendly(err.message, info, tried);
      if (info.kind === "min" || info.kind === "paused" || info.kind === "liquidity") {
        // This token can't pay this invoice right now: take it off the list and offer ones that can.
        avail = avail || {};
        avail[tried.assetId] = { ok: false, kind: info.kind, minUsd: info.minUsd };
        fillChains(tried.blockchain);
        showAlternatives(tried);
      }
    } finally {
      button.disabled = !selected;
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

  // Copy the full-precision amount so payers never round it down by hand.
  $("copy-amount").addEventListener("click", (e) => copy(quote.amountInFormatted, e.currentTarget));
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
    // A receipt link anyone can open; it re-checks the payment live with NEAR Intents.
    const rq = new URLSearchParams({ d: quote.depositAddress, to: link.to, amt: link.amt.toFixed(2), tok: quote.symbol, ch: quote.chain });
    if (quote.depositMemo) rq.set("m", quote.depositMemo);
    if (link.note) rq.set("for", link.note);
    const receiptUrl = `${location.origin}/receipt?${rq}`;
    $("receipt-link").href = receiptUrl;
    $("copy-receipt").onclick = (e) => copy(receiptUrl, e.currentTarget);
    if (ok) store.remove(storeKey);
  }

  // ---- Helpers ---------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function friendly(message, info = {}, token = null) {
    const m = String(message || "");
    const pair = token ? `${token.symbol} on ${chainName(token.blockchain)}` : "this token";
    if (info.kind === "min") return `NEAR Intents only accepts ${pair} for payments of $${formatUsd(info.minUsd)} or more right now. Pick another way to pay below.`;
    if (info.kind === "paused") return `NEAR Intents has paused payments from ${pair} for now. Pick another way to pay below.`;
    if (info.kind === "liquidity") return `Nobody is offering to swap ${pair} right now. Pick another way to pay below, or try again in a few minutes.`;
    if (/refund/i.test(m) && /address|valid/i.test(m)) return `That doesn't look like a ${token ? chainName(token.blockchain) + " " : ""}address. Check it and try again.`;
    if (/recipient/i.test(m) && /valid/i.test(m)) return "This payment link has a NEAR account that NEAR Intents doesn't accept. Ask for a new link.";
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
