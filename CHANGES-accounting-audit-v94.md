# v94 - accounting audit and hardening

## Decision applied
Only production costs (direct material, direct labour, factory overhead) can be job (product) cost - IAS 2.
Administration, selling and finance costs stay period expenses.

## Fixed
1. Production Account cards: cost of goods manufactured, cost per pack and the cost mix now include the wages and
   overheads absorbed into stock (they previously showed Rs 3,240 where finished goods received Rs 4,840).
   The reconciliation check also allows for amounts released to job-closing variance (5390).
2. Job completion is one unit: every check and both confirmations happen BEFORE anything is posted; the write-off,
   final costing entry, stock movements and job-line saves undo themselves if any later step fails.
3. Cost tagged to a completed job cannot be removed once it is inside finished goods: expense cancel, journal reversal,
   re-tagging and wage-log cancel are all refused before anything changes (the old guard checked an always-empty list).
4. Completion true-down: if tags were removed before completion, stock is reduced only by what is still in stock; the part
   belonging to pairs already sold is released to 5390 Closed Job Adjustments (no negative stock value).
5. Job tags: admin / selling / finance heads can no longer be tagged to a job; the absorbed amount and job cost sheet use
   production costs only.
6. All-or-nothing saves added (a failure now leaves NO half-posted record): expense (a ghost voucher was left behind when
   job tagging failed), invoice, invoice cancel, delivery note cancel (also reverses revenue of migrated notes), receipt and
   payment reversal, supplier payment, purchase cancel, accrued-expense payment, manual material issue / return, stock
   adjustments, production-log cancel, cheque clear / endorse / apply advance, advance apply / refund / endorse.
7. Ledger reversal: the reversal entry and the "reversed" flag are saved as one unit (a failed flag could allow a double reversal).
8. A job with wages/expenses tagged to it cannot be cancelled (orphan tags); only in-progress jobs can be cancelled.
9. New Health Check controls: 5291 agrees with the jobs; no completed job over-absorbed; no stock line with value but zero quantity.

## Left as designed
- A sales return debits all its (net) value to Sales 4000 and leaves the 4010 discount untouched. Net revenue is identical and
  every sales report reads returns this way.

## Not changed / not tested
- Loans, fixed assets, opening-balance screens, cheque-bounce fee, staff loans, payroll month-end, cash-count adjustment still post
  and then save in separate steps (each is a single ledger entry; the Health Check flags any mismatch).
- The user-guide text still names the old report menus.
