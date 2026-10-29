// Small helpers used by both pages.
(function () {
  const CHAIN_NAMES = {
    near: "NEAR", eth: "Ethereum", base: "Base", arb: "Arbitrum", op: "Optimism", pol: "Polygon",
    bsc: "BNB Chain", avax: "Avalanche", gnosis: "Gnosis", bera: "Berachain", sol: "Solana",
    btc: "Bitcoin", doge: "Dogecoin", ltc: "Litecoin", bch: "Bitcoin Cash", zec: "Zcash", xrp: "XRP Ledger",
    tron: "Tron", ton: "TON", sui: "Sui", aptos: "Aptos", stellar: "Stellar", cardano: "Cardano",
    starknet: "Starknet", monad: "Monad", plasma: "Plasma", xlayer: "X Layer", adi: "ADI",
    abs: "Abstract", scroll: "Scroll", hypercore: "Hyperliquid", aleo: "Aleo", dash: "Dash",
    movement: "Movement", fogo: "Fogo",
  };

  function chainName(id) {
    if (!id) return "";
    return CHAIN_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);
  }

  function isNearAccount(value) {
    const v = String(value || "").trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(v)) return true;
    if (/^0x[0-9a-f]{40}$/.test(v)) return true;
    return v.length >= 2 && v.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(v);
  }

  function formatUsd(n) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function qr(el, text) {
    el.innerHTML = "";
    if (!window.QRCode) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    new window.QRCode(el, {
      text, width: 192, height: 192, colorDark: "#1c2b4b", colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    el.removeAttribute("title");
  }

  async function copy(text, button) {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Copy failed";
    }
    setTimeout(() => (button.textContent = original), 1600);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.data = data || {};
      throw err;
    }
    return data;
  }

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
    remove(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
  };

  window.PMA = { chainName, isNearAccount, formatUsd, qr, copy, api, store };
})();
