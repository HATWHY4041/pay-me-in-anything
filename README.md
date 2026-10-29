# Pay Me in Anything

One payment link. Your client pays with **any token on any chain**; you receive **USDC in your NEAR account**.

Built at **NEAR HACKATHON 2026** · Track: Real-World Money · Powered by [NEAR Intents](https://docs.near-intents.org/) (1Click API)

## The problem

A freelancer in Lagos invoices a client who only holds ETH on Base. Today that means: agree on a chain, the client bridges, swaps, sends, and someone eats the fees and the wait. Pay Me in Anything turns that into one link.

## How it works

```
You make a link ──▶ Payer opens it ──▶ picks chain + token ──▶ app asks 1Click for an EXACT_OUTPUT quote
                                                                         │
 Page shows "Paid" ◀── you receive USDC on NEAR ◀── NEAR Intents swaps ◀─┘ payer sends to a one-time address
                                       (fails or expires → payer is refunded on their own chain)
```

- **No smart contract and no database.** The link carries the receiver, amount and note (`/pay?to=ade.near&amt=50.00&name=Ade&for=Logo`).
- **EXACT_OUTPUT quotes** mean the receiver always gets the full invoice amount; the payer sees exactly how much of their token covers it.
- Each payment gets a **fresh one-time deposit address** from NEAR Intents, with a QR code and a countdown.
- The page **polls the status** and shows a receipt with a "Paid" stamp on success. Refunds go to the payer's own address.

### NEAR Intents endpoints used

| Endpoint | Where | Why |
| --- | --- | --- |
| `GET /v0/tokens` | `api/tokens.js` | Every chain and token the payer can choose |
| `POST /v0/quote` | `api/quote.js` | One-time deposit address for an exact USDC amount out |
| `GET /v0/status` | `api/status.js` | Live payment state (pending → processing → success / refunded) |
| `POST /v0/deposit/submit` | `api/submit.js` | Optional: payer pastes their tx hash to speed up detection |

Payout asset: native USDC on NEAR (`nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`).

## Run it locally (under 2 minutes, no installs)

Requires Node.js 20 or newer. There are no dependencies to install.

```bash
git clone <this repo>
cd pay-me-in-anything
node server.js
```

Open http://localhost:3000, create a link with any NEAR account, then open the link. The token list loads live from NEAR Intents.

Optional: `export ONECLICK_JWT=<key from partners.near-intents.org>` before starting removes the 0.2% 1Click fee.

## Deploy

Import the repo on Vercel (no framework, no build step). `public/` is served as static files and `api/` runs as serverless functions. Add `ONECLICK_JWT` as an environment variable if you have one.

## Project layout

```
public/index.html, create.js   Create-a-link page
public/pay.html, pay.js        Pay page: token picker, deposit address, QR, live status, receipt
public/shared.js, app.css      Shared helpers and styles
api/*.js                       Thin server-side proxies to the 1Click API (keeps the key private)
server.js                      Zero-dependency local server that mirrors Vercel
```

## What's next

- Payments history page for receivers
- Choose a payout token and chain other than USDC on NEAR
- Invoice PDFs and email receipts

## License

MIT
