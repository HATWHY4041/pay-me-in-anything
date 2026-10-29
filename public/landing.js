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

  function renderChips() {
    $("chips").innerHTML = PRESETS.map((p, i) =>
      `<button type="button" class="chip" aria-pressed="${i === chosen}" data-i="${i}">${p.label || p.symbol}${(p.label || p.symbol) === chainName(p.chain) ? "" : `<small>${chainName(p.chain)}</small>`}</button>`
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
  $("calc-amt").addEventListener("input", update);
  renderChips();
  update();

  // Live data from NEAR Intents (through our /api/tokens route)
  api("/api/tokens").then(({ tokens }) => {
    for (const p of PRESETS) {
      const t = tokens.find((x) => x.symbol === p.symbol && x.blockchain === p.chain);
      if (t && t.price) p.price = t.price;
    }
    update();
    const chains = [...new Set(tokens.map((t) => t.blockchain))];
    $("stat-chains").textContent = chains.length;
    $("stat-tokens").textContent = tokens.length;
    $("hero-note").textContent = "Live prices from NEAR Intents. No sign-up, no smart contract.";
    const counts = {};
    tokens.forEach((t) => (counts[t.blockchain] = (counts[t.blockchain] || 0) + 1));
    chains.sort((a, b) => counts[b] - counts[a] || chainName(a).localeCompare(chainName(b)));
    $("nets").innerHTML = chains.map((c) => `<span>${chainName(c)}<small>${counts[c]}</small></span>`).join("");
    $("net-intro").textContent = `${chains.length} networks and ${tokens.length} tokens right now, loaded live from NEAR Intents. The number after each network is how many of its tokens you can be paid in.`;
  }).catch(() => { /* keep the static fallbacks */ });

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
