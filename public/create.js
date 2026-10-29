// The "Create a link" page. The link itself carries everything (who, how much, what for),
// so no database is needed: anyone with the link can pay it.
(function () {
  const { isNearAccount, qr, copy } = window.PMA;
  const form = document.getElementById("create");
  const errorEl = document.getElementById("create-error");
  const result = document.getElementById("result");
  const linkOut = document.getElementById("link-out");
  const openLink = document.getElementById("open-link");
  let currentLink = "";

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

    linkOut.textContent = currentLink;
    openLink.href = currentLink;
    qr(document.getElementById("link-qr"), currentLink);
    result.hidden = false;
    result.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });

  document.getElementById("copy-link").addEventListener("click", (e) => copy(currentLink, e.currentTarget));

  function fail(message, field) {
    errorEl.textContent = message;
    const input = form.elements[field];
    if (input) input.focus();
  }
})();
