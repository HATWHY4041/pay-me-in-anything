// Homepage: live calculator, live stats and networks, scroll-in stamp.
(function () {
  const { chainName, api, formatUsd } = window.PMA;
  const $ = (id) => document.getElementById(id);

  // Popular ways to pay, matched against the live token list. Prices here are only a fallback.
  const PRESETS = [
    { symbol: "SOL", chain: "sol", price: 100 },
    { symbol: "ETH", chain: "base", price: 2300 },
    { symbol: "USDT", chain: "tron", price: 1 },
    { symbol: "BTC", chain: "btc", price: 80000 },
    { symbol: "USDC", chain: "arb", price: 1 },
    { symbol: "wNEAR", chain: "near", price: 4.5, label: "NEAR" },
  ];
  let chosen = 0;
  const calcAvail = {}; // "assetId@amount" -> availability from /api/availability
  let calcTimer = null;

  // Ask which preset tokens can pay this amount right now (cached at the edge, so this is cheap).
  function checkPresets() {
    clearTimeout(calcTimer);
    calcTimer = setTimeout(async () => {
      const amt = Math.round(Number(String($("calc-amt").value).replace(/[$,\s]/g, "")) * 100) / 100;
      const ids = PRESETS.map((p) => p.assetId).filter(Boolean);
      if (!ids.length || !(amt >= 0.5 && amt <= 100000) || ids.every((id) => calcAvail[`${id}@${amt}`])) return;
      try {
        const { assets } = await api(`/api/availability?amt=${amt}&assets=${ids.map(encodeURIComponent).join(",")}`);
        for (const id of ids) calcAvail[`${id}@${amt}`] = assets[id] || { ok: null };
        renderChips();
        update();
      } catch { /* keep the plain estimate */ }
    }, 450);
  }


  function isOff(p) {
    const amt = Math.round(Number(String($("calc-amt").value).replace(/[$,\s]/g, "")) * 100) / 100;
    const a = p.assetId && calcAvail[`${p.assetId}@${amt}`];
    return Boolean(a && a.ok === false);
  }

  function renderChips() {
    $("chips").innerHTML = PRESETS.map((p, i) =>
      `<button type="button" class="chip${isOff(p) ? " off" : ""}" aria-pressed="${i === chosen}" data-i="${i}">${p.label || p.symbol}${(p.label || p.symbol) === chainName(p.chain) ? "" : `<small>${chainName(p.chain)}</small>`}</button>`
    ).join("");
  }

  function update() {
    const amt = Number(String($("calc-amt").value).replace(/[$,\s]/g, ""));
    const ok = Number.isFinite(amt) && amt > 0;
    const p = PRESETS[chosen];
    if (!ok) {
      $("calc-out").innerHTML = "Enter an amount";
      $("calc-recv").textContent = "0.00 USDC";
      return;
    }
    const a = p.assetId && calcAvail[`${p.assetId}@${amt}`];
    if (a && a.ok === false) {
      const pair = `${p.label || p.symbol} on ${chainName(p.chain)}`;
      $("calc-out").innerHTML = (a.kind === "min"
        ? `${pair} needs at least $${formatUsd(a.minUsd).replace(/\.00$/, "")} right now`
        : `${pair} is paused right now`) +
        `<small>A temporary NEAR Intents limit. Your client can still pay this with any token that's live, and the pay page only offers those.</small>`;
      $("calc-recv").textContent = `${formatUsd(amt)} USDC`;
      return;
    }
    const n = amt / p.price;
    const digits = n >= 100 ? 2 : n >= 1 ? 4 : n >= 0.01 ? 5 : 7;
    $("calc-out").innerHTML = `About ${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${p.label || p.symbol}` +
      `<small>sent on ${chainName(p.chain)}, plus about 1% for the swap. The exact amount is shown on the pay page.</small>`;
    $("calc-recv").textContent = `${formatUsd(amt)} USDC`;
  }

  $("chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    chosen = Number(b.dataset.i);
    renderChips();
    update();
  });
  $("calc-amt").addEventListener("input", () => { renderChips(); update(); checkPresets(); });
  renderChips();
  update();

  // Live data from NEAR Intents (through our /api routes)
  api("/api/tokens").then(({ tokens }) => {
    for (const p of PRESETS) {
      const t = tokens.find((x) => x.symbol === p.symbol && x.blockchain === p.chain);
      if (t) { p.assetId = t.assetId; if (t.price) p.price = t.price; }
    }
    update();
    checkPresets();
    renderNetworks(tokens, null);
    $("hero-note").textContent = "Live prices from NEAR Intents. No sign-up, no smart contract.";
    // Which networks can take a typical $100 invoice right now
    api("/api/availability?amt=100").then(({ assets }) => renderNetworks(tokens, assets)).catch(() => {});
  }).catch(() => { /* keep the static fallbacks */ });

  function renderNetworks(tokens, assets) {
    const live = (t) => !assets || !assets[t.assetId] || assets[t.assetId].ok !== false;
    const chains = [...new Set(tokens.map((t) => t.blockchain))];
    const counts = {};
    tokens.forEach((t) => { if (live(t)) counts[t.blockchain] = (counts[t.blockchain] || 0) + 1; });
    const on = chains.filter((c) => counts[c]).sort((a, b) => counts[b] - counts[a] || chainName(a).localeCompare(chainName(b)));
    const off = chains.filter((c) => !counts[c]).sort((a, b) => chainName(a).localeCompare(chainName(b)));
    const liveTokens = tokens.filter(live).length;
    const offLabel = (c) => {
      const mins = tokens.filter((t) => t.blockchain === c).map((t) => assets && assets[t.assetId]).filter((x) => x && x.kind === "min").map((x) => x.minUsd);
      return mins.length ? `from $${formatUsd(Math.min(...mins)).replace(/\.00$/, "")}` : "paused";
    };
    $("stat-chains").textContent = on.length;
    $("stat-tokens").textContent = liveTokens;
    $("nets").innerHTML =
      on.map((c) => `<span>${chainName(c)}<small>${counts[c]}</small></span>`).join("") +
      off.map((c) => `<span class="off">${chainName(c)}<small>${offLabel(c)}</small></span>`).join("");
    $("net-intro").textContent = assets
      ? `${on.length} networks and ${liveTokens} tokens can pay a $100 invoice right now, checked live with NEAR Intents a few minutes ago. ` +
        (off.length ? `The ${off.length} faded network${off.length > 1 ? "s are" : " is"} paused by NEAR Intents or only take larger payments for the moment; the pay page only offers what works for each invoice.` : "")
      : `${chains.length} networks and ${tokens.length} tokens listed by NEAR Intents. The number after each network is how many of its tokens you can be paid in.`;
  }

  // Sticky header border once you scroll
  const bar = $("topbar");
  const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // The Paid stamp lands when step 4 scrolls into view
  const box = $("stampbox");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { box.classList.add("in"); io.disconnect(); }
    }, { threshold: 0.8 });
    io.observe(box);
  } else {
    box.classList.add("in");
  }
})();
