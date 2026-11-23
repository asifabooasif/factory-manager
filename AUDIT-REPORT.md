# Accounting & BOM Audit — Factory Manager (Lanka Slipper ERP)

## Honest scope
I read the posting code of the core ledger, stock engine, purchases, GRN, jobs, BOM, production, sales (delivery/invoice/receipt), returns, inventory adjustments, expenses/absorption, payroll run, reports and health check, and ran the real screens in a test harness (purchase → job → BOM issue → labour → release → delivery → invoice → receipt → supplier payment). Trial balance stayed balanced and every stock/ledger control check agreed.
NOT run/tested: payroll runs, staff loans, fixed assets/depreciation, loans, cheques desk, petty cash, bank reconciliation, period locking, backup/sync. "1000% accurate" cannot be certified until those are exercised with your real data.

## Fixed in this version
1. BOM issue now has ONE engine (E.issueByBom): one journal entry, weighted-average cost, all-or-nothing with rollback. Used by Material Ledger > Issue by BOM, Production > Material Batches and New Job.
2. New Job has "Issue all materials by BOM now" (default ON) + issue date. Stock shortage is shown before saving; if issue fails the job is still created and the reason is shown.
3. BUG: Issue-by-BOM never saved the "packs started" counter (screen was re-read after it redrew). Fixed (screen read first).
4. Issuing more packs than the job target now asks for confirmation.
5. Production Material Batches used to deduct stock BEFORE posting the ledger (a failure left stock/ledger apart) — now the shared atomic engine.
6. Ledger entry + stock move + document are now one unit (auto-reversal on failure) for: purchase, delivery note, FG release, sales return, purchase return.
7. Stock "opening" adjustment credited Owner Capital (3000); now Opening Balance Equity (3200), same as item opening stock.

## Open accounting findings (not changed — need your decision)
A. No VAT/SVAT/WHT: settings switch exists but nothing posts tax. Needed if you are VAT registered (input VAT on purchases, output VAT on invoices, VAT control account, return).
B. Inventory costing excludes overhead unless you run "Absorb overhead" manually; unabsorbed factory overhead sits in P&L, so FG/WIP stock is understated vs SLFRS/IAS 2. The "shadow allocation" on job sheets is management-only and not in the ledger; check it is not added on top of absorbed overhead (double count).
C. Reports are not Busy-style: no Trading Account (Opening stock + purchases + direct expenses − closing stock = gross profit), no grouped Balance Sheet (current/fixed assets, current/long-term liabilities), no schedule-wise notes. Default P&L year is calendar year; Sri Lanka usually uses 1 Apr–31 Mar. No year-end closing wizard (profit to date is cumulative).
D. Sales discount is debited straight to Sales (4000); a separate "Sales Discount" account is better. No purchase discount / freight-in on purchase bill lines.
E. Jobs store targets as fractional packs when pairs are not divisible by the pack size (100 pairs = 16.667 packs); stock quantity is rounded to 3 decimals. Prefer pairs in multiples of the pack.
F. BOM is per article only: no per-colour/per-size BOM, no wastage %, no alternate materials, no unit conversion, no BOM versions. Consumable "mode" is stored but only the BOM mode deducts.
G. Reversals/cancellations post on today's date; cancelling in a locked period is blocked (correct) but old-period corrections need a manual journal.
H. Many other postings (payroll, expenses, invoices, receipts) still use post-then-save; failures are caught by the Health Check but not auto-repaired.
I. Health Check does not yet verify: fixed-asset register vs 1400/1410, loan register vs loan liabilities, 2100 EPF/ETF vs payroll, 2300 accrued expenses, 5390 closed-job adjustments.

## Suggested next steps (priority)
1. Run a month of real data with the new BOM issue and Health Check daily.
2. Decide on VAT (A) and overhead absorption policy (B).
3. Build Busy-style Trading A/c + grouped Balance Sheet and year-end close (C).
4. Test payroll, assets, loans, cheques with scenario scripts (I can extend the harness).

## Update 2 — Purchase price changes & average cost
- Costing method: moving weighted average. Each purchase re-averages stock; every issue to a job is valued at the average on that day and that value is frozen on the job (later price changes never alter old jobs). Verified: 100 kg @500 + 100 kg @600 → average 550, job issue valued at 550; a later purchase @800 moved the average to 635.03 while the issued value stayed unchanged.
- NEW: every purchase / GRN now updates the item's latest purchase price (default on the next purchase and in BOM estimates). The earlier price is kept once as the standard. A back-dated purchase does not overwrite a newer latest price.
- NEW: Material Ledger > "Cost & prices" tab: on hand, average cost used for issues, stock value, last purchase price and date, lowest, highest, last-vs-average %.
- GRN (PO receipt) is now atomic (ledger + stock + bill + PO in one unit).
- Known limit: the average is taken at the moment you save. A back-dated issue uses today's average, not the average as at that date. Enter issues and purchases in date order.

## Update 3 — Reports and account-coding fixes
- NEW Reports > "Trading A/c": Opening stock + purchases (net of returns) + direct costs ± adjustments − closing stock = cost of sales, with an automatic check against Cost of Goods Sold (5400). Tested with purchases, jobs, release, delivery, invoice, stock loss and purchase return.
- Profit & Loss regrouped: Income → Gross profit → expenses by nature (direct, factory overhead, factory losses, admin, selling, finance, other). Net profit verified equal to the independent ledger total.
- Balance Sheet regrouped: Fixed assets, Current assets (cash & bank / receivables / inventories), Equity, Loans & borrowings, Current liabilities, with a balance check.
- Financial year: report bar has "FY starts <month>" (saved per factory; default January — choose April if your year is 1 Apr–31 Mar) and This FY / Last FY / This month shortcuts.
- BUG FIXED: "Owner drawings" vouchers were posting to 3200 Opening Balance Equity. Now new account 3300 Owner Drawings. Existing drawings already posted to 3200 must be corrected by a journal.
- BUG FIXED: cash-count shortage/excess was posting to 6090 Office Rent. Now new account 6195 Cash Over / Short. Past entries must be corrected by a journal.
- Bank-charges quick voucher pointed to Finance Charges (6060); now Bank Charges (6140).
- Invoice discounts now post to new 4010 Sales Discounts (contra-sales) instead of reducing 4000; profit reconciliation updated.
- New accounts are added automatically to existing factories when the app opens.
- Still open: VAT/SVAT/WHT (needs your registration details), overhead absorption policy, duplicate overhead accounts (5210/6010 Electricity, 5220/6000 Rent), year-end closing wizard.

## Update 4 — Assets, loans, payroll, returns tested
- Tested end to end (trial balance + Health Check after each step): sales delivery → invoice with discount → sales return → purchase → purchase cancel → purchase return; fixed-asset purchase → depreciation → disposal; monthly salary posting. All balanced; all control checks agreed.
- Fixed assets: depreciation now posts ONE journal per month (before, several months were lumped into the last month, distorting monthly P&L). Disposal now requires depreciation to be run up to the disposal month first and no longer posts a zero line. Assets can be bought on credit (2000) or against Opening Balance Equity (3200).
- Existing-loan opening balance debited Owner Capital (3000); now Opening Balance Equity (3200).
- Wage pay-run payment is now atomic (ledger + run status in one unit).
- Balance Sheet equity now splits profit into "earlier financial years" and "current financial year" (no closing journal needed; works with the FY start month setting).
- Read-verified, not run through the screens: cheque desk, petty cash, staff loans, wage-run building from production logs.
- Policy items still open: VAT/SVAT/WHT, overhead included in stock value, depreciation of machinery goes to period expense (5260) not product cost, duplicate overhead accounts.

## Update 5 — Remaining modules tested; critical name-clash bug
- CRITICAL BUG FIXED: two screens used the same action name "prSave". The Print Settings screen (printdocs.js) overrode Production > Save, so pressing Save on daily production entries saved print settings and recorded NO production/wage accrual. Print Settings now uses "pdSave". A project-wide scan found no other harmful clashes (the others are intentional wrappers or replacements: po.js/settlement.js/dailyallocation.js/labels.js).
- Tested end to end with trial balance + Health Check after every step: petty cash (top-up, expense, over-spend guard); customer cheque receive → clear → bounce with bank return charge; staff loan → recovery inside a salary run → write-off; production log (36 pairs) → wage run with EPF/ETF (2210 cleared, employer on-cost into WIP, logs marked paid); customer receipt against invoice; supplier payment against bill. All agreed.
- Made atomic (ledger + allocation + record, auto-undo on failure): production log save and cancel, cheque received/issued, customer receipts, supplier payments (bank, cash, own cheque, customer-cheque receipt).
- Opening balances: every opening entry (cash/bank, customers, suppliers, staff advances/loans, existing loans, stock) now offsets to 3200 Opening Balance Equity instead of a mix of 3000 and 3200. Entries already posted keep their old account; if you want the opening equity shown as Owner Capital, post one journal Dr 3200 / Cr 3000.
- Note: raw manual journals posted straight to stock, bill or receivable accounts are flagged by the Health Check (that is its job); post stock and bill changes through their screens.

## Update 6 — Accounting Guardian, Year-End Close, Account Clean-up
- NEW js/modules/guardian.js (loaded from index.html, cached by sw.js v82).
- FOUND: js/modules/notify.js (Notification Center) was in the project but index.html never loaded it, so no bell/alerts ran. It is now loaded (before the Guardian).
- ACCOUNTING GUARDIAN (Reports > Accounting Guardian): scans on opening, 4+ seconds after every posting, and every 5 minutes. 19 rules: control totals (same as Health Check), abnormal balances, manual journals on control accounts, future/back-dated entries, purchase price jumps, sales below cost, material use above BOM, wastage level, expense spikes vs own 3-month history, overdue customers, cheques, EPF/ETF not remitted, depreciation behind, undelivered-invoice ageing, job hygiene (completed job holding WIP), BOM/item master gaps, duplicate accounts / opening equity, month-end discipline. Each finding explains WHAT / WHY / WHAT TO DO, links to the screen, and can be snoozed 7 days. Score 0-100; a coloured chip (bottom-left) shows the score on every screen; new critical findings raise a toast, a bell message and a desktop/phone notification.
- YEAR-END CLOSE (Reports > Year-End Close): checklist (Health Check, Guardian, depreciation, wages paid, accruals, stock-take advisory, earlier years closed), preview of profit and closing stock, owner types the date to confirm, then the year is locked and a snapshot saved. Profit is carried forward into retained earnings on the Balance Sheet (same method as Tally/Busy: books stay continuous, no closing journals, so dashboards and old reports are unaffected). Only the latest year can be reopened (owner, audited).
- ACCOUNT CLEAN-UP (Reports > Account Clean-up): finds duplicate accounts and merges them (balance moved by one journal, duplicate hidden, history kept). New factories no longer get the duplicate accounts 6000 Factory Rent, 6010 Electricity, 6040 Maintenance & Repairs (use 5220, 5210, 5230).
- Tested: planted a hand journal on stock, a 60% price jump, a sale below cost, a BOM-less article, an expense spike, duplicates -> all detected; year-end close, lock, reopen and merge -> trial balance and Health Check stayed clean.

## Update 7 — Overhead pool reminder and owner's PDF guide
- Guardian rule 19 added: factory overhead left in the pool for over 35 days (existing month-end "Absorb overhead" in Expenses & Costs already charges the pool to jobs; no automatic switch was added, because the manual month-end absorption already matches how Tally/Busy-style systems work and avoids double-charging).
- Owner's guide PDF (Factory-Manager-Accounting-Guide.pdf): one real worked example (1,200 pairs of Flat A100) with the actual journal entries, cost build-up per pair/pack, how expenses and wages flow, where to find product cost, controls and routines.

## Update 8 — CORRECTION on depreciation and overhead criteria
- CORRECTION: earlier notes (Update 4 and the chat summary) said machinery depreciation is a period expense not added to product cost. That is wrong for FACTORY machinery: account 5260 has nature "Indirect factory overhead", so it is in the overhead pool and becomes product cost when the pool is absorbed (if the pool is never absorbed it hits profit that month). Only OFFICE depreciation (6150) is always a period expense. Verified by running a depreciation entry and checking E.unabsorbed().
- Owner's guide PDF now has three pages on the absorption criteria (what enters the pool, which jobs receive it, the four bases with a worked comparison, watch-outs, and the separate shadow-cost method) and the depreciation wording is corrected.
- Known behaviours worth a future decision: absorption weights are job-to-date (not month-specific); the pool is cumulative; absorption only reaches jobs In Progress; the account nature, not the entry-screen treatment, decides what is pooled.

## Update 9 — Final deep pass on the current system (upload 11)
Tested through the real screens (demo factory, trial balance and Health Check after every step): job completion, expenses (job / pool / period / accrual), overhead absorption, cancellations and reversals (delivery, invoice, receipt, purchase), vouchers / drawings / transfers, stock-take, purchase orders with partial receipts, cash flow / production account / dashboard against the ledger.
Fixed:
- Job completion: material issued for pairs that were never made no longer silently inflates the cost of the pairs made. Net issued material (issues less returns) beyond what the BOM needs for the packs released is written off to Factory Loss 5300, controlled by Settings > Wastage rule (ask / always factory loss / always add to product cost). That setting existed but was not used anywhere; it is now.
- Factory machinery depreciation (5260) is excluded from the overhead pool (period expense, per owner's decision).
- Production Account separated "factory cost of production" (= product cost used for stock) from "full cost" (adds administration, selling, finance); it previously added office salaries and rent into "total cost of product".
- Vouchers now refuse control accounts inside the save (not only in the dropdown).
- Made atomic (ledger + records succeed or are reversed): expenses, vouchers, transfers, stock-take, wage payment (earlier), production log, cheques, receipts, payments.
- Save handlers (sales return, purchase return, invoice, release, absorption, asset, GRN) now read the form values BEFORE awaiting the database, removing an intermittent "Date is required" when a form was changed during the save.
- Guardian rule 19: overhead pool not absorbed for 35 days.
Findings left as information: the "Add cost to job" function (E.A.addCost) has no button and is unreachable; the Users & Access screen needs the cloud sign-in; VAT / SVAT / WHT are still not built.
