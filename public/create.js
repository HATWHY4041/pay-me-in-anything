// The "Create a link" page. The link itself carries everything (who, how much, what for),
// so no database is needed: anyone with the link can pay it.
(function () {
  const { isNearAccount, qr, copy, store, formatUsd } = window.PMA;
  const $ = (id) => document.getElementById(id);
  const form = $("create");
  const errorEl = $("create-error");
  const RECENT_KEY = "pma:recent";
  let currentLink = "";
  let currentName = "";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const to = String(data.get("to") || "").trim().toLowerCase();
    const amt = Number(String(data.get("amt") || "").replace(/[$,\s]/g, ""));
    const note = String(data.get("for") || "").trim();

    if (!name) return fail("Enter the name your client will see.", "name");
    if (!isNearAccount(to)) return fail("Enter a NEAR account, like ade.near or the long address from your wallet.", "to");
    if (!Number.isFinite(amt) || amt < 0.5) return fail("Enter an amount of at least $0.50.", "amt");
    if (amt > 100000) return fail("Links are limited to $100,000.", "amt");

    const params = new URLSearchParams({ to, amt: amt.toFixed(2), name });
    if (note) params.set("for", note);
    currentLink = `${location.origin}/pay?${params}`;
    currentName = name;

    $("link-out").textContent = currentLink;
    $("open-link").href = currentLink;
    qr($("link-qr"), currentLink);
    $("result").hidden = false;
    $("share-link").hidden = !navigator.share;
    remember({ link: currentLink, amt, note, to, at: Date.now() });
    $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });

  $("copy-link").addEventListener("click", (e) => copy(currentLink, e.currentTarget));

  $("share-link").addEventListener("click", async () => {
    try {
      await navigator.share({ title: `Pay ${currentName}`, text: `Pay ${currentName} with any token`, url: currentLink });
    } catch { /* share sheet closed */ }
  });

  // qrcodejs draws a canvas (and an img); export the canvas as a PNG with a white margin.
  $("download-qr").addEventListener("click", () => {
    const canvas = $("link-qr").querySelector("canvas");
    if (!canvas) return;
    const pad = 32, out = document.createElement("canvas");
    out.width = canvas.width + pad * 2; out.height = canvas.height + pad * 2;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `pay-${currentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "me"}-qr.png`;
    document.body.appendChild(a); a.click(); a.remove();
  });

  // Recent links, kept only in this browser
  function remember(item) {
    const list = (store.get(RECENT_KEY) || []).filter((x) => x.link !== item.link);
    list.unshift(item);
    store.set(RECENT_KEY, list.slice(0, 8));
    renderRecent();
  }
  function renderRecent() {
    const list = store.get(RECENT_KEY) || [];
    $("recent").hidden = list.length === 0;
    $("recent-list").innerHTML = list.map((x) => {
      const label = `$${formatUsd(x.amt)}${x.note ? ` for ${escapeHtml(x.note)}` : ""}`;
      return `<li><span>${label}</span><span><a href="${escapeHtml(x.link)}">Open</a></span></li>`;
    }).join("");
  }
  $("clear-recent").addEventListener("click", () => { store.remove(RECENT_KEY); renderRecent(); });
  renderRecent();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function fail(message, field) {
    errorEl.textContent = message;
    const input = form.elements[field];
    if (input) input.focus();
  }
})();
