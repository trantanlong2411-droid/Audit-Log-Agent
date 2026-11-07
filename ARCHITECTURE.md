# Architecture — Audit-Log Agent

```mermaid
flowchart TD
 User[Public wallet + UTC start/end] --> Edge[Cloudflare Worker]
 Edge --> Validate{Validate wallet and <=31d dates}
 Validate -->|Reject| Error[Explain invalid input]
 Validate -->|Valid| MCP[Official Pharos Chain MCP]
 MCP --> ID{Chain ID = 1672?}
 ID -->|No| Error
 ID -->|Yes| Block[Bounded timestamp-to-block mapping]
 Block --> Samples[3 noncontiguous block windows]
 Samples --> Log[Filtered Transfer + Approval event logs]
 Samples --> Native[Sample full block transactions]
 Log --> Enrich[Up to 6 get_transaction and bounded receipts]
 Native --> Enrich
 Enrich --> Categorize[Five categories with evidence]
 Categorize --> Totals[Observed-only counts, volumes, notable links]
 Totals --> Web[Plain-language report + coverage caveats]
 Web --> MD[Export Markdown]
 Web --> CSV[Export CSV]
 ```

## Why not an exhaustive period report?

Official Chain MCP `get_logs` allows 1,000 blocks per request and has no address-indexed native transaction list endpoint. A week on Pharos contains far more than 1,000 blocks, and Cloudflare Workers Free caps external subrequests at 50 per invocation. It would be dishonest to claim totals for the whole week without an indexed chain explorer database. Thus all summaries say **observed sampled records**, not full-period transactions. The report includes exact scanned block windows and any RPC failures.

## Categories & classification

- `transfer_in`: `Transfer` event with recipient matching the queried address, or a sampled block transaction paying native PROS to it.
- `transfer_out`: `Transfer` event with sender matching wallet, or a sampled transaction sending native PROS from it.
- `approval`: `Approval` event with indexed owner matching the wallet, or a supported outgoing approval selector in an enriched transaction. Historical event alone is not proof of current remaining allowance.
- `swap`: outgoing enriched transaction with an explicit known swap method selector; no speculative labeling of arbitrary calls. Receipt verification is attempted when relevant, and lack of V2 swap-log confirmation is reported as a warning.
- `contract_interaction`: other observed outgoing transaction with non-empty calldata from the queried wallet, when discovered through a sampled block or event-linked transaction.

Some categories overlap: a swap may produce ERC-20 transfers, and an ERC-20 `Approval` event may correspond to an approval call. These are **event category records**, not unique mutually exclusive transactions. Totals have no USD valuation, avoiding unsupported exchange-rate guesses.

## Date alignment

The Worker reads chain tip and a historical anchor block to estimate mean block time. It uses a short correction loop to locate an on-chain block timestamp close to UTC boundaries; it refuses to fake coverage if RPC data cannot align within its tolerance. Public metadata preserves approximate block bounds and the selected dates.

## Export integrity

The client sends the already-created report to `/api/export`, which converts the exact same records to:
- Markdown with a header, plain-language summary, category table, observed totals, notable transaction links and audit-scope disclosure.
- UTF-8 BOM CSV with columns for category, asset, amount, block, transaction, sender/receiver, explorer and source.

The export is an activity report, NOT a compliance certification, financial statement or attestation of innocence.

## Auditability

Reproducible code and unit tests in GitHub; separate live MCP smoke job; production-check job validates the public Worker, categories and both exports. No private key, signature, user account, wallet approval or broadcast.

## Optional exact transaction evidence

To make the public demo useful even when the wallet has no activity in the three sampled log windows, the user may submit up to two known transaction hashes. Each is verified by official Chain MCP transaction, matching wallet, actual block timestamp within the requested UTC range and receipt; relevant ERC-20 logs and a proven swap method selector are then classified. This is exact per-transaction evidence, **not address-indexed historical discovery**. The built-in example demonstrates a real Pharos swap from 2026-11-05.
