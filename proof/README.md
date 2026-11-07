# Reviewer mapping — Audit-Log Agent

**Medium · Compliance / Security · 100 points (+50 with actual video)**

| Challenge requirement | Implementation and actual proof |
|---|---|
| Accept wallet and date range | Public UI with 0x address and UTC start/end inputs; `validateRequest` checks dates and 31-day maximum |
| Groups transfers in/out, swaps, approvals, contract interactions | `parseLog` for real ERC-20 events; sampled native block tx; linked outgoing tx selectors; five distinct category counters |
| Includes totals per category and notable tx links | `makeReport` generates observed-only counts, token volume per direction, top 6 sourced transaction links; all sampling limitations disclosed |
| Export as Markdown, PDF or CSV | Implemented **both Markdown and CSV** via `POST /api/export` and in-browser download buttons |
| Reviewer demo proof | [Public Worker](https://audit-log-agent.trantanlong2411.workers.dev/), [live CI](https://github.com/trantanlong2411-droid/Audit-Log-Agent/actions), [architecture](../ARCHITECTURE.md) |

**No invented evidence:** A unit-test fixture is not a live transaction. Real chain calls are verified by the live smoke and deployed Worker workflows. Data is sampled, not a complete wallet activity index; all reported totals are explicitly **sample-only**. Optional video not created.

- Optional exact transaction evidence: two hashes max, checked against wallet address, on-chain timestamp and receipt. Built-in demo uses a real Mainnet swap with selector 0x414bf389.
