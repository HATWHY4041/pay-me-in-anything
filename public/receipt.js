// A shareable receipt: the link names the deposit address, and the page checks it live with NEAR Intents.
(function () {
  const { chainName, isNearAccount, formatUsd, api, copy } = window.PMA;
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const r = {
    d: q.get("d") || "", m: q.get("m") || "", to: (q.get("to") || "").toLowerCase(), amt: Number(q.get("amt")),
    note: (q.get("for") || "").slice(0, 80), tok: (q.get("tok") || "").slice(0, 12), ch: (q.get("ch") || "").slice(0, 16),
  };
  if (!r.d || !isNearAccount(r.to) || !Number.isFinite(r.amt)) { $("bad").hidden = false; return; }

  $("slip").hidden = false;
  $("r-to").textContent = `To ${r.to}`;
  $("r-amt").textContent = `$${formatUsd(r.amt)}`;
  if (r.note) { $("r-note").textContent = `For ${r.note}`; $("r-note").hidden = false; }
  $("r-copy").addEventListener("click", (e) => copy(location.href, e.currentTarget));

  const TEXT = {
    PENDING_DEPOSIT: ["working", "Waiting for the payment"],
    KNOWN_DEPOSIT_TX: ["working", "Payment spotted, waiting for confirmation"],
    INCOMPLETE_DEPOSIT: ["bad", "Less than the full amount arrived"],
    PROCESSING: ["working", "Payment received, converting to USDC"],
    SUCCESS: ["done", "Paid and delivered"],
    REFUNDED: ["bad", "Refunded to the payer"],
    FAILED: ["bad", "The payment failed"],
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function check() {
    try {
      const qs = new URLSearchParams({ depositAddress: r.d });
      if (r.m) qs.set("depositMemo", r.m);
      const s = await api(`/api/status?${qs}`);
      const [state, text] = TEXT[s.status] || ["working", "Checking"];
      $("r-status").dataset.state = state;
      $("r-status-text").textContent = text;
      const rows = [["To", r.to]];
      if (s.amountOutFormatted) rows.push(["Received", `${s.amountOutFormatted} USDC`]);
      if (s.amountInFormatted) rows.push(["Paid with", `${s.amountInFormatted} ${r.tok}${r.ch ? ` on ${chainName(r.ch)}` : ""}`]);
      if (Number(s.refundedAmountFormatted) > 0) rows.push(["Refunded", `${s.refundedAmountFormatted} ${r.tok}`]);
      rows.push(["Deposit address", `<code style="font:500 12px/1.4 var(--mono)">${esc(r.d.slice(0, 8))}…${esc(r.d.slice(-6))}</code>`]);
      if (s.destinationTxHashes && s.destinationTxHashes[0]) {
        const h = s.destinationTxHashes[0];
        rows.push(["NEAR transaction", `<a href="https://nearblocks.io/txns/${encodeURIComponent(h)}" target="_blank" rel="noopener">${esc(h.slice(0, 10))}…</a>`]);
      }
      $("r-rows").innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${k === "To" || k === "Received" || k === "Paid with" || k === "Refunded" ? esc(v) : v}</span></li>`).join("");
      if (s.status === "SUCCESS" || s.status === "REFUNDED" || s.status === "FAILED") {
        $("r-stampwrap").hidden = false;
        $("r-stamp").textContent = s.status === "SUCCESS" ? "Paid" : s.status === "REFUNDED" ? "Refunded" : "Failed";
        if (s.status !== "SUCCESS") $("r-stamp").style.color = $("r-stamp").style.borderColor = "var(--alert)";
        return;
      }
    } catch (err) {
      $("r-status-text").textContent = "Can't reach NEAR Intents right now. Retrying…";
    }
    setTimeout(check, 8000);
  }
  check();
})();
