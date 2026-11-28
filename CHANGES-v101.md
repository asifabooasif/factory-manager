# v101 - your v100 + the v98 bulletproof fixes + classic accounting books

## Base
Your v100 (Transaction Explorer, update detector, custom Data Reset, Guardian and assistant rules) is kept.
The stricter all-or-nothing save logic from v98 is merged over: fixed assets / depreciation / disposal, cash count,
opening balances, bank loans and instalments, cheque return and cancel, sales legacy move, job-completion cost true-up
(sold packs keep their value, difference to 5390), overhead pool (only the not-yet-charged part), journal control-account guard.
`E.unreverse` added to the ledger core (used to roll back failed cheque actions).

## New: Reports > Accounting Books (js/modules/classicbooks.js)
Daily Transaction Report, Day Book, Cash Book, Bank Book, Receipts & Payments, Sales Book, Purchase Book, Expense Book.
All read the journal, so they agree with the Trial Balance. Each has Save CSV and Print; each shows its own agreement check.

## Classic screens visible again (router.js)
Report Center (old Day Book, Trial Balance, Ledger, Cash & Bank, Receivables/Payables), Financial Reports, Period Summary,
Ledger Search and Trial Balance are back in the sidebar. The Report Suite (66 reports) is unchanged.
Still hidden (the Suite covers them): Budget vs Actual, Profitability, Cash Forecast, Cost Reconciliation.

## Version
v101 in sw.js and appupdate.js; sw.js cache list includes classicbooks.js.

## Tests (run on this build, all pass)
Suites 1-4: 60/27/19/43 - Explorer 7 - fix-suite 31 - opening balances 8 - failure injection 4 -
books-suite 40 (includes the 82-step full November cycle, no findings).
update-check U2 is a timing-sensitive check: it fails now and then on the untouched v100 too and passes on re-run.

Not tested: year-end close, multi-user / Firebase sync, printing, your real data. Try it on a copy of your data first.
