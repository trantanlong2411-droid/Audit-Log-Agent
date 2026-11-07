# Audit-Log Agent — Pharos Agent Arena

**Challenge:** Medium · Compliance / Security · **100 points** (+50 optional video).

**Public Worker (verify after CI deployment):** https://audit-log-agent.trantanlong2411.workers.dev/
**Source:** https://github.com/trantanlong2411-droid/Audit-Log-Agent

## What it does

A public read-only wallet audit activity report using **official Pharos Mainnet Chain MCP** (`https://mcp.pharos.xyz/mcp`, chain 1672).

A reviewer can:
1. Enter any **public EVM address** and a **UTC start and end calendar date** (up to 31 days).
2. Generate a plain-English report with **transfers in, transfers out, swaps identified, approvals, and contract interactions** that the scan actually found.
3. See **counts by category**, token volume by direction, and notable observed transactions with explorer proof links.
4. Export the exact report via **Markdown (.md)** or **CSV (.csv)**, no wallet sign-in or secret needed.

Actual data acquisition:
- `get_chain_info`, `get_block`, `get_logs`, `get_transaction` and `get_transaction_receipt` from official read-only hosted MCP.
- Map the requested UTC days to nearby real chain blocks by block timestamps and a bounded correction loop.
- Sample **three noncontiguous 1000-block windows** across the chosen period, for each of USDC, WPROS, WETH. For each token/window, run two topic-indexed event queries: `Transfer` out / `Approval` by wallet, and `Transfer` in. RPC `get_logs` limits each query to at most 1000 blocks.
- Inspect a full block from the middle of each sample for **native PROS transfers and outgoing calls**.
- Follow up to **six observed transaction hashes** for method-selector-based `swap` and `contract_interaction` labels, without inventing transaction details. A swap selector that is not independently verified is marked with a caution. Missing RPC results remain marked incomplete.

## Critical reporting limitations

This is a **sampled demonstration, not a full indexed transaction history**. Pharos's official hosted MCP does not expose address-indexed `txlist`; its event-log range is capped at 1000 blocks per call, while Cloudflare Workers Free has a 50-external-subrequest limit per execution. The chosen date range determines where the *samples* are taken; a date range of 7 days does **not** imply all blocks in those 7 days were scanned.

**All category totals and asset volumes are totals of *observed events in scanned samples only*.** They are NOT totals for the complete calendar period. Swaps and their constituent token transfers may overlap because an on-chain swap can emit more than one transfer log. Internal calls, unknown ERC-20 tokens, NFT activity, off-chain approvals and uninspected blocks cannot be claimed. If events = 0, it means *no events observed* in the limited sample, not that the wallet was inactive.

No private keys, passwords, wallet connection, transaction signing, broadcast, revocation, or modification of blockchain records.

## How to verify

1. Open the [public Worker](https://audit-log-agent.trantanlong2411.workers.dev/); enter a public wallet, select UTC date range.
2. Click **Generate audit report**, inspect the category counts, sample completeness warnings and explorer links.
3. Click **Export Markdown** and **Export CSV**; both produce real, non-placeholder files reflecting the same report.
4. Check `GET /api/health` for live version metadata; `POST /api/analyze` for source-backed JSON.
5. Inspect [architecture](ARCHITECTURE.md), [reviewer proof mapping](proof/README.md), and [GitHub Actions](https://github.com/trantanlong2411-droid/Audit-Log-Agent/actions).
6. CI includes unit tests with controlled **test fixtures** and a separate live MCP verification plus a production Worker check. Synthetic transactions in unit tests are never served by the public website.

## API

| Method | Path | Function |
|---|---|---|
| GET | `/` | Public audit UI |
| GET | `/api/health` | App version, token coverage and scope warning |
| POST | `/api/analyze` | `{"address":"0x...","start":"2026-11-01","end":"2026-11-07"}` |
| POST | `/api/export?format=markdown` | JSON report body → markdown text file |
| POST | `/api/export?format=csv` | JSON report body → CSV text file |

`/api/export` converts an existing report; it does **not** requery MCP, avoiding a second scan or differences between the export and the UI.

## Deployment

```sh
npm install
npm test
npm run build    # Wrangler dry run (does not deploy)
npm run smoke    # real live Pharos Chain MCP reads only
npx wrangler deploy
```

Cloudflare Worker: **audit-log-agent** → Builds → connect GitHub repository `trantanlong2411-droid/Audit-Log-Agent`, branch `main`, deploy command `npx wrangler deploy`. After deployment, `/api/health` should show `pharos-audit-log-2026-11-07-v1`.

### Sources

- [Pharos official Chain MCP (read-only tools and 1000-block maximum)](https://github.com/PharosNetwork/pharos-mcp)
- [Cloudflare Workers request limits](https://developers.cloudflare.com/workers/platform/limits/)
- [ERC-20 standard events](https://eips.ethereum.org/EIPS/eip-20)

An optional bonus video was not created as part of this build. The user may record the live UI if requested by reviewers.

## Verified transaction supplement for sparse wallets

Since a short free-plan block sample can often find zero transactions for a valid wallet, the public form also accepts **up to two optional real transaction hashes**. The Worker verifies each hash through `get_transaction`, its exact on-chain `get_block` timestamp, and `get_transaction_receipt`. It rejects unrelated / out-of-period hashes and decodes token events from the receipt. This supplements (but never disguises) the incomplete sampled search. The built-in example uses a **public observed swap transaction** on 2026-11-05 at block 22,205,123, with its real sender and hash; it is not a fabricated sample.
