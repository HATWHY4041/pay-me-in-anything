# Pay Me in Anything

One payment link. Your client pays with **any token on any chain**; you receive **USDC in your NEAR account**.

Built at **NEAR HACKATHON 2026** for the Real-World Money track, powered by [NEAR Intents](https://docs.near-intents.org/) (1Click API).

**Live app:** https://pay-me-in-anything.vercel.app

## For judges: 5-minute path

1. **The idea.** Freelancers get paid in whatever the client holds. The receiver always gets the exact invoice amount in USDC on NEAR.
2. **Watch it.** The demo video is on the site at [/#watch](https://pay-me-in-anything.vercel.app/#watch) and in the X post.
3. **Try it live, no money needed.**
   - Open [/create](https://pay-me-in-anything.vercel.app/create), enter any NEAR account and an amount, then open the link.
   - Pick a chain and token, and paste an address on that chain as the refund address.
   - The page returns a real NEAR Intents quote, a one-time deposit address, a QR code and a countdown.
4. **Check the proof.** Two real mainnet payments are listed under "Tested with real money" below.
5. **Read the code.** The four files in `api/` call the 1Click endpoints; the pages are plain static files in `public/`. There is no contract and no database.
6. **Run it.** `node server.js` (Node 20+, nothing to install). The `curl` command under "Run it locally" returns a live quote.

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

- **No smart contract and no database.** The link carries the receiver, amount and note (`/pay?to=ade.near&amt=1.00&name=Ade&for=Logo`).
- **EXACT_OUTPUT quotes** mean the receiver always gets the full invoice amount; the payer sees exactly how much of their token covers it.
- Each payment gets a **fresh one-time deposit address** from NEAR Intents, with a QR code and a countdown.
- The page **polls the status** and shows a receipt with a "Paid" stamp on success. Refunds go to the payer's own address.
- **Live availability check.** NEAR Intents pauses networks, sets temporary minimums and loses liquidity from time to time (in late October 2026 Ethereum mainnet was paused and USDT on Tron needed $100+). Before the payer picks anything, `/api/availability` runs a free dry quote for every token at the invoice's exact amount, and the pay page only offers the ones that will work. The rest are greyed out with the reason ("paused right now", "min $100"). If a quote still fails, the page suggests working alternatives in one tap.
- **Memo chains handled.** Stellar deposits need a memo; the app requests one automatically and shows it next to the address.
- **Wrong-network guard.** Multi-chain wallets list the same token on several chains, so the deposit screen says exactly which network to send from. A "Copy amount" button keeps payers from rounding the amount down.

### NEAR Intents endpoints used

| Endpoint | Where | Why |
| --- | --- | --- |
| `GET /v0/tokens` | `api/tokens.js` | Every chain and token the payer can choose |
| `POST /v0/quote` (dry) | `api/availability.js` | Which tokens can pay an invoice of this size right now (paused chains, minimums, liquidity) |
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
api/availability.js            Live check of which tokens can pay a given amount right now
server.js                      Zero-dependency local server that mirrors Vercel
```

## What's next

- Server-side payments history for receivers
- Choose a payout token and chain other than USDC on NEAR
- Invoice PDFs and email receipts

## License

MIT
