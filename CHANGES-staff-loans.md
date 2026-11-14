# Staff loans: what changed

## New behaviour
- Staff loans are interest-free and tracked as a running balance: pending = loan - recoveries.
- Every wage run, monthly salary run and daily salary shows each person's PENDING LOAN and a DEDUCT box (pre-filled from the loan's "usual deduction", editable every time). The screen shows "after: Rs X" live.
- A deduction can never exceed the pending balance. Checked on screen, again when you press Review, and again just before posting.
- Repayments outside payroll (cash / bank) and write-offs are recorded on the loan screen, each with Undo.
- Existing loans given before using the system can be entered as "existing loan" (no bank movement).
- New screen: People & Payroll -> Loan Integrity Check. Also added to Health Check and Closing Checklist.

## Other transaction problems found and fixed
1. Payroll posted the ledger entry first and swallowed errors when updating the loan. A failure left the ledger and the loan out of step. Now ledger entry, run record, loan deduction and production logs succeed or fail together, with automatic rollback.
2. Cancelling a payroll ignored loan-reversal errors. Now errors are shown and cancelling twice is blocked.
3. Wage runs did not check advance recovery against the advance balance. Now they do.
4. Daily salary, advances, loans and run posting could be posted twice by a double click. Now guarded.
5. The same employee could be paid the same month (monthly) or the same dates (daily) twice. Now blocked (cancel the first to redo).
6. Employee Ledger counted loan recoveries twice. Fixed.
7. Salary & Advance Register and Summary used today's loan balance for past months. Now balances are as at the period dates.
8. Data Reset did not erase staff loans (orphan loans stayed after a reset). Fixed (also closed-job variances).
9. An employee with loan history could be deleted. Now only deactivated, with a warning if a balance is pending.
10. Wage run only showed a loan box when an instalment was "due", so a loan could not be deducted at other times. Removed.
