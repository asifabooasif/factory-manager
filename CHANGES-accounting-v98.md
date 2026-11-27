# v98 - fixes for the four defects found in the v97 full-month audit

## 1. Overhead pool could be shared twice (High)  - js/modules/expenses.js
Overhead that was already tagged straight to a job (a live ledger-backed costing record on a pool head) was still counted in the "unabsorbed" pool, so the screen offered to share it again and accepting it added WIP with no expense behind it (profit and stock overstated).
`unabsorbed()` now subtracts it. Sharing more than the real pool is refused. Guardian / month-end checks use the same figure.

## 2. True-up landed only on unsold pairs (Medium)  - js/modules/jobs.js (completion)
When part of an article was sold before completion, the packs still in stock carried the whole difference between provisional and final cost, so cost of sales was understated and stock overstated.
Completion now values the packs still in stock at (unsold packs x final cost per pack) and charges the sold packs' share to 5390 Closed Job Adjustments (inside the P&L; credit if the final cost is lower). Articles with nothing sold behave exactly as before.
Assumption: the packs still on hand of that item are this job's packs (average-cost stock cannot tell jobs apart).

## 3. Posting first, saving the record afterwards (Medium)
Ledger entry and record are now ONE unit (E.postThen): if the record cannot be saved, the entry is reversed automatically.
- Fixed asset purchase (assets.js)
- Bank loan creation (loans.js) - the new loan account (2401...) is also removed again, so no orphan account is left
- Loan instalment and early settlement (loans.js)
- EPF/ETF remittance (payroll.js) - the remit record now also stores its journal id

## 4. Manual journal on stock-controlled accounts (Medium)  - js/core/ledger.js
A manual journal can no longer post to 1300 Raw Material Stock, 1310 Work in Progress or 1320 Finished Goods (they belong to the stock and job records). Purchases, issues, returns, gains/losses, stocktake, jobs and opening balances are unaffected.

## Tests
tests/accounting-suite-4.js (new): pool double count, true-up with sold packs (including cost arriving after the last release), forced save failures on asset / loan / instalment / remittance, stock-account guard, all reports. Suites 1-3 still pass (106 checks).
Cache version: lanka-erp-v98.

## Not changed (as agreed)
Factory depreciation stays a period cost. A cost tagged to a completed job stays a period expense. 

## Added after the first v98 delivery
- loans.js: undo instalment, undo settlement and cancel loan now save the record first and reverse the entry second; if the reversal fails the record is put back. No half-done state is left anywhere in the loan screens.
- guardian.js: three new rules. "Ledger entries without their record" (orphans), "Job closing variances" (5390 after completion) and "Overhead shared beyond what was booked" (critical).
- ai-assistant.js: the assistant now knows these rules (ask "explain the true-up rule", "5390", "why can't I post to 1300", "what changed in v98") and answers with live figures; the optional LLM bridge also receives the rules as background.
- tests: suite 4 now has 43 checks.

## v99 - Transaction Explorer: searchable account ledgers + shortcut
- Every account is searchable in the Transaction Explorer: type part of a code or name (filters all matching ledgers) or pick the exact account (opens it as a ledger).
- A single account with no other filter shows opening balance, a running balance on every line and the closing balance for the chosen dates.
- Click any account name in any row to jump straight to that account's ledger. The ✕ button clears it.
- Shortcut: Alt+L from any screen opens the Transaction Explorer with the account search focused.
- tests/explorer-ledger.js (7 checks). Cache version: lanka-erp-v99.
