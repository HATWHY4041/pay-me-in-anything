# Pay Me in Anything

One payment link. Your client pays with **any token on any chain**; you receive **USDC in your NEAR account**.

Built at **NEAR HACKATHON 2026** for the Real-World Money track, powered by [NEAR Intents](https://docs.near-intents.org/) (1Click API).

**Live app:** https://pay-me-in-anything.vercel.app

## Tested with real money (mainnet)

| Paid with | Received | Time to "Paid" |
| --- | --- | --- |
| 1.0158 USDC on Solana | 1.0 USDC in `ayoadhe.near` (excess 0.0101 USDC refunded to the payer) | ~45 s |
| 0.01 SOL on Solana | USDC in `ayoadhe.near` | under 2 min |

Both payments were made from a HOT wallet on a phone, using only the pay page.

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
- **Wrong-network guard.** Multi-chain wallets list the same token on several chains, so the deposit screen says exactly which network to send from. A "Copy amount" button keeps payers from rounding the amount down.

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
git clone https://github.com/HATWHY4041/pay-me-in-anything
cd pay-me-in-anything
node server.js
```

Quick API check without the UI (a price preview only; it never returns a deposit address):

```bash
curl "http://localhost:3000/api/quote?originAsset=nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near&recipient=wrap.near&refundTo=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045&amountUsd=5"
```

Open http://localhost:3000, create a link with any NEAR account, then open the link. The token list loads live from NEAR Intents.

Optional: `export ONECLICK_JWT=<key from partners.near-intents.org>` before starting removes the 0.2% 1Click fee.

## Deploy

Import the repo on Vercel (no framework, no build step). `public/` is served as static files and `api/` runs as serverless functions. Add `ONECLICK_JWT` as an environment variable if you have one.

## Pages

| Page | What it does |
| --- | --- |
| `/` | Product site: live price calculator, how it works, demo video, features, live network list, FAQ |
| `/create` | Make a payment link: copy, share sheet, download the QR code, recent links (saved in your browser) |
| `/pay` | The payer's page: chain and token picker, one-time address, QR, live status, receipt |
| `/receipt` | Shareable receipt that re-checks the payment live with NEAR Intents every time it opens |

## Project layout

```
public/index.html, landing.js  Product homepage (site.css)
public/create.html, create.js  Create-a-link page
public/receipt.html, receipt.js Shareable, live-verified receipt
public/pay.html, pay.js        Pay page: token picker, deposit address, QR, live status, receipt
public/shared.js, app.css      Shared helpers and styles
api/*.js                       Thin server-side proxies to the 1Click API (keeps the key private)
server.js                      Zero-dependency local server that mirrors Vercel
```

## What's next

- Server-side payments history for receivers
- Choose a payout token and chain other than USDC on NEAR
- Invoice PDFs and email receipts

## License

MIT
