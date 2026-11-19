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
