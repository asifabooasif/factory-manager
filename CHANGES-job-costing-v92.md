# Job costing v92 — WIP removed from labour and expenses

## The rule
Every expense, daily salary, wage run, piece-rate log, petty cash and transport entry posts to the ledger as a normal expense (Dr expense account / Cr cash, bank, accrued or wages payable). The job is only a costing tag stored in `costAllocations`. A tag stops counting automatically when its ledger entry is cancelled or reversed.

WIP (1310) now holds only materials issued to jobs. Materials still go stock -> WIP -> finished goods -> cost of sales. Finished goods are valued at materials only; wages and overheads are period expenses.

## What changed
- production.js: a production log posts Dr 5110 Piece-Rate Wages / Cr 2210, plus one costing record per log (job and article). Cancelling one log voids only its record. Logs made before v92 (already in WIP) still cancel the old way.
- payroll.js: employer EPF/ETF on piece wages posts to 5140 with a costing record (no WIP).
- matstock.js: BOM miscellaneous amounts are standard costing records only (no ledger lines). A BOM with only miscellaneous items cannot be "issued".
- expenses.js: month-end overhead sharing is costing-only (nothing posted). The overhead pool is reduced by live shares. Duplicate warning when head, amount, date and payee match a live expense.
- joballoc.js: new helpers, plus Accounting > Job Cost Reconciliation (ledger expense = tagged to jobs + no job, per account, and total per job).
- jobs.js: new "Allocated costs" tab on every job (total, by account, every record); per-article table shows allocated cost and cost per pair; "Materials in WIP" label.
- rs-production.js: Job Costing Summary, job sheet and article statement include allocated costs (WIP balance stays the ledger figure).
- closing.js: new month-end check that allocations never exceed the ledger expense they tag.
- purge.js, sw.js (cache v92).

## Old data
Costs already charged to WIP before v92 stay in WIP and still appear on their jobs. Nothing old is changed.

## Check before relying on it
- Count each cost on a job once: do not both tag an expense and share the same head through the overhead pool, and do not keep the same head in Fixed Expenses daily rates as well.
- Production Account (manufacturing statement) follows the ledger, so new labour appears in period expenses, not in WIP.
