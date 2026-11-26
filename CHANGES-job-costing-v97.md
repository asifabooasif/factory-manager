# Job costing v97 — WIP builds as costs are incurred (absorption costing)

## The rule (as in professional manufacturing systems)
1. Every expense, daily salary, wage run, piece-rate log, petty cash and transport entry posts to its OWN ledger account as a normal expense (Dr expense / Cr cash, bank, payable or wages payable). Financial reports always see it there.
2. The job is only a costing tag (costAllocations). When a PRODUCTION cost (direct material, direct labour, factory overhead, or a month-end overhead share) is tagged to a job that is in progress, the system ALSO posts one absorption entry on the entry's own date:
   Dr 1310 Work in Progress (job, article) / Cr 5291 Wages & Overheads Absorbed (contra to the expense).
   So WIP, the balance sheet, the profit and loss and the job cost sheet always agree while the job is running.
3. Release moves a proportional share of the WIP (materials + absorbed wages/overheads) into finished goods at a PROVISIONAL cost. Completion trues every article up to the exact cost (any difference on pairs already sold goes to 5390).
4. Cancelling or reversing the source entry, clearing the tag, or deleting the document reverses the absorption entry automatically. Running the sync twice never double-counts.
5. Administration, selling and finance costs are never product cost (IAS 2). BOM miscellaneous amounts stay standard costing records only (no ledger lines).

## Default changed
Settings > "Finished goods are valued at" now defaults to **Full cost**. "Materials only" is still available (absorption is switched off).

## What changed
- ledger.js: post() can carry absOf (the costing record an absorption entry belongs to); reverse() and postThen() run the absorption sync afterwards.
- joballoc.js: syncAbsorb() (idempotent): creates the Dr 1310 / Cr 5291 entry for every live production costing record of an in-progress job and reverses it for records that were removed, cancelled or whose entry was reversed. allocPut / allocRaw / allocVoid call it.
- jobs.js: full cost is the default; cost sheet excludes the absorption lines from "Posted" so nothing is counted twice; per-article table shows "In finished stock" and a status (Provisional / Final); new tab "Daily progress" (target, started, finished through every operation, ready to release, released, still to finish, stock value booked, and a day-by-day, per-article grid of pairs finished); "Work in progress" KPI.
- rs-production.js: Production Account shows a row "Wages & overheads tagged to jobs, absorbed into WIP as incurred"; absorption straight into finished goods now means only what was absorbed at release/completion.
- settings.js: default full cost.
- tests: suite 1 updated for the new rule (I0, I1), new suite 3 (S1-S8: wage tagged -> WIP, back-dated cost keeps its date, cancel reverses absorption, idempotent, provisional release, progress tab, completion). Suites 1, 2 and 3 pass.

## Old data
Costs tagged before v97 are absorbed automatically the first time anything is posted or a tag changes after you install this version (on their original dates). Costs posted into WIP before v92 stay as they are.

## Things to know
- Enter back-dated transactions in date order: back-dated material issues still use today's average cost.
- A cost tagged to a COMPLETED job is not absorbed into WIP (stock is already fixed); it stays a costing record.
- Every tagged cost creates one small absorption entry (visible in the Journal, source "release", narration "Absorbed into WIP").
