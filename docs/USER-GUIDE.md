# Lanka Slipper ERP — Complete User Guide

This guide teaches the whole system step by step: how to start a new factory, how finished goods are kept in packs, how materials are bought and used, how daily production and piece-rate wages work, how salaries and advances are handled, how expenses are classified, and how to close every month with confidence.

> Golden rule: **enter every transaction in the screen made for it.** Never post a cost twice. The system keeps stock, wages, expenses and the ledger in agreement, and the **Month-end Close** page proves it.

## 1. The big picture

- **Factory** — each factory is completely separate: its own data, its own database, its own users and its own Google Sheet. Switch factory from the box at the top.
- **Finished goods** are made, counted and sold in **colour packs**. One pack = one size run in one colour (example: article F001, category Flat, Black, sizes 6,7,7,8,8,9). Stock, jobs, deliveries and invoices all use **packs**. One barcode per article + colour (never per size).
- **Materials & accessories** (production materials) are **bought**, so they carry a **purchase price** — never a selling price.
- **Jobs** collect every cost: materials issued, wages from daily production, direct expenses, absorbed overheads. When a job is completed the exact cost per pack is fixed.
- **Daily production** records who made how many packs of which article/colour in which operation. Wages are worked out at once and charged to the job.
- **Wage runs** pay exactly those production entries (plus daily wages, salaries, overtime, bonus) and recover advances.
- **Expenses** are entered against an expense head that tells you whether the cost is direct, indirect, administrative, selling or finance, and how it is treated.

## 2. People and permissions

| Role | What the person can do |
|---|---|
| Owner | Everything in every factory, adds factories, manages people |
| Staff — Accountant (per factory) | Enter and edit all data in that factory |
| Staff — Viewer (per factory) | Look only, in that factory |

The default owner is **asifabooasif@gmail.com**. Under **System → Users & Access** the owner adds each person with their Google email, chooses Owner or Staff, and ticks the factories a staff member may use and the role in each. Changes take effect at once, even for people already signed in. People sign in with Google when they open the system.

## 3. Starting a new factory — the Setup Wizard

When you create a factory the **Setup Wizard** opens by itself (also under System → Setup Wizard). It asks for everything the system must know before you start, and **nothing is saved until you review and confirm**. Your answers are kept as a draft, so you can stop and continue another day.

1. **Factory** — finished-goods categories (for example `Flat, PU`) and the default pairs in one pack.
2. **Articles** — one row per article: article no, name, category, **size run in one pack** (`6,7,7,8,8,9`), colours (`Black, Brown, Navy`), selling price per pack, opening packs per colour and cost per pack. Every colour becomes its own pack with its own barcode.
3. **Materials & accessories** — code, name, type (Raw Material / Accessory / Packing), unit, **purchase price per unit**, supplier, reorder level, opening quantity, specification. A supplier you type is created automatically.
4. **Operations & rates** — each step a worker is paid for per pack: top making, upper making, sole fixing, buckle fitting, finishing, packing. Enter the standard rate per pack.
5. **Employees** — name, NIC, phone, Monthly or Daily, salary or daily rate, allowances, piece-rate worker?, EPF member?, advance already owed.
6. **Review & confirm** — counts, opening stock values and a list of anything missing. Fix the listed problems, tick the confirmation box, press **Confirm & create everything**.

Tip: in every step use **Paste from Excel / Google Sheets** to add many rows at once — copy the cells, paste, done.

After the wizard: enter opening cash, bank, customer and supplier balances under **System → Opening Balances**; add a **BOM** to each article (Items → BOM); create your first Job.

Opening stock is posted: Dr Raw Material Stock (1300) / Dr Finished Goods Stock (1320) / Dr Employee Advances (1250), Cr Opening Balance Equity (3200).

## 4. Items

### Finished goods
Open **Masters → Items → + New Item**, category **Finished Good**.

- **Article No** — for example F001 (printed big on labels).
- **Finished-goods category** — Flat, PU, … (managed in Settings → Finished-goods categories).
- **Size run in ONE pack** — `6,7,7,8,8,9`. The number of sizes becomes the pairs in a pack.
- **Selling price per PACK**.
- **Colours** — each colour creates a pack SKU (F001-BLACK) and an EAN-13 barcode.

Add more colours later with the **Colours** button on the list. Chips and the search bar on the Items page filter by category, article, colour or barcode.

### Materials, accessories and packing
Choose category Raw Material, Accessory or Packing. Enter the **purchase price per unit** (what you pay the supplier), preferred supplier, reorder level and specification. These items never have selling prices.

### Barcode labels
**Import / Export → Barcode labels** (or the 🏷 button in Inventory) prints one label per colour pack: the **big article number**, colour, size run and the barcode. Choose a category and the number of copies.

## 5. Buying materials

**Factory → Purchases → + New Purchase.** Choose the supplier, add lines with the picker. When you pick a material the **rate fills in from the last price paid** (or the standard purchase price). Posting: Dr Raw Material Stock (1300) / Cr Trade Payables (2000). Pay suppliers with **Pay Supplier**. Payables ageing shows what is overdue.

Every purchase updates stock and the material's average cost. The **Material Ledger → Item history** shows the **price history** for each material and how each price compares with the standard.

## 6. Controlling material stock — daily deductions

### Issue by BOM (recommended each morning)
1. Add the **BOM** to each article once (Items → BOM): the quantity of each material needed for **one pack**.
2. **Factory → Material Ledger → Issue by BOM**, choose the job and date.
3. Type how many packs of each article/colour you are starting today. The materials needed are calculated and compared with stock (shortages are flagged).
4. Press **Issue these materials to the job**. Each material is deducted from stock at its average cost and charged to the job: Dr Work In Progress (1310, job, Material) / Cr Raw Material Stock (1300).

### Manual issue and return
On the job page, **Issue / return materials** handles one-off issues and returns of unused material.

### Histories and control
- **Item history** — every receipt, issue, return and adjustment with running quantity, value and average cost for any date range.
- **Daily usage** — what was used each day, by job (CSV download).
- **Reorder & cover** — on hand, reorder level, daily use over 30 days and **days of cover** with Out / Low / OK status.

## 7. Jobs and costing

1. **Factory → Jobs & Costing → + New Job** — customer (or stock production), due date, and the articles/colours with **packs**.
2. Issue materials (section 6).
3. Record daily production (section 8). Labour is charged to the job automatically.
4. Add direct expenses to the job (section 10) or let overheads be absorbed at month end.
5. **Release goods** as batches finish; they enter finished stock at a provisional cost.
6. **Complete job** — the exact cost per pack is fixed and finished stock is trued-up.

The job page shows Materials, Labour, Overheads, Wastage and WIP balance, a cost sheet per article and every transaction.

## 8. Daily production and piece-rate wages

### Operations and rates (once, then when rates change)
**Factory → Daily Production → Operations & rates.**
- **+ Operation** (or *Add standard slipper operations*) — name, order in the process and the **standard rate per pack**.
- **+ Rate override** — a different rate for a whole **category** (e.g. Flat) or one **article**, from a date. Rate priority: article override → category override → standard rate. Old work keeps the rate it was logged at.

### Recording the day's work
**Daily Production → Daily log.** For each row choose:

1. **Worker** (searchable list),
2. **Job**,
3. **Article / colour** (from that job's lines),
4. **Operation** (top making, buckle fitting…),
5. **Packs** made.

The **rate and amount fill in by themselves.** Press **Save production**. For every entry the system posts: Dr Work In Progress (job, Labour) / Cr Accrued Piece-Rate Wages (2210). So job cost is always up to date and every wage is traceable to a worker, job, article and operation.

- A warning appears if the total for an operation passes the job target.
- A wrong entry that is still unpaid can be **Cancelled** (a reversing entry is posted).
- **Summary** — by worker and operation, by operation, by job; CSV download.
- **Job progress** — for each job, packs done per operation against the target, with progress bars.

## 9. Payroll — wages, salaries, daily pay and advances

### Employees
**Masters → Employees.** Pay type **Monthly** (fixed salary + allowances) or **Daily** (rate per day). Tick *piece-rate worker* for production workers (any employee can earn piece-rate). Set EPF membership, where time-based wages are normally charged (Factory overhead or Admin) and an optional **monthly advance recovery** instalment.

### Attendance
Mark attendance daily (Factory → Attendance). Days worked and overtime hours flow into the wage run for daily workers.

### Giving an advance
**Payroll → Give advance** (or from the Employee Ledger): choose the person, amount, date, the bank/cash account and a note. Posting: Dr Employee Advances (1250) / Cr bank or cash. The **Advances outstanding** table shows who owes what.

### Running wages
**Payroll → + Wage Run.**
1. Choose **Weekly, Fortnightly, Monthly or Daily**, the pay date and the period.
2. Press **Load production, attendance & advances**. The table lists everyone with earnings:
   - **Piece wages** from unpaid production entries up to the end date, with the operation-wise breakdown under each name,
   - **Days** from attendance for daily workers,
   - **Monthly salary + allowances** for salaried staff in a Monthly run, with **no-pay days** from absences,
   - **OT hours** from attendance (1.5× the hourly rate), **bonus**, **other deductions**,
   - **Advance balance, Recover now and Balance after** — the recovery defaults to the instalment (or the whole balance) and can be changed; you see the **remaining balance** straight away.
3. Choose where time-based wages are charged: factory overhead, admin, a job, or split across jobs.
4. Press **Post wage run**. Piece wages clear the accrual: Dr 2210. Time-based wages and employer EPF/ETF go to the job, overhead or admin. Cr Wages Payable (net), Cr EPF/ETF Payable, Cr Employee Advances (recovered), Cr Staff Deductions Payable.
5. **Pay** posts Dr Wages Payable / Cr bank or cash. **Payslips** print with operation-wise piece work, deductions and advance balance before and after.
6. **Cancel** (before payment) returns the production entries to "earned, unpaid".

**Worked example.** Nimal, monthly salary Rs 60,000, advance owed Rs 15,000. Monthly run, recovery Rs 5,000: gross 60,000, EPF 8% 4,800 (if member), advance recovery 5,000, net 50,200. Advance balance after: 10,000. Kamal, daily Rs 2,500, 5 days: 12,500 plus piece wages 12 packs of top making at Rs 120 = 1,440.

### Employee Ledger
**Factory → Employee Ledger.** Choose a person and a period to see every production earning, wage run, payment, advance given and advance recovered with the running advance balance, and print a statement.

## 10. Expenses and cost classification

**Accounting → Expenses & Costs → + New expense.** Pick the **expense head**. The panel instantly shows its **nature**, whether it is a **product cost** (direct or indirect), and its **behaviour** (fixed / variable / semi).

| Nature | Examples | Default treatment |
|---|---|---|
| Direct material | leather, EVA sheet, buckles | Charged to job(s) |
| Direct labour | piece-rate wages, production salaries | Charged to job(s) |
| Indirect factory overhead | electricity, factory rent, machine repairs, glue & thread, freight in, depreciation, supervisors | Factory overhead pool (absorbed later) — or charge to jobs now |
| Administrative | admin salaries, telephone, stationery, insurance | Period expense |
| Selling & distribution | delivery, marketing, commission | Period expense |
| Finance | interest, bank charges | Period expense |

**Charged to job(s):** choose the jobs and their share % (must total 100%). Posting: Dr Work In Progress (each job) / Cr payment account.
**Factory overhead pool / Period expense:** Dr the expense account / Cr payment account.
**Payment:** any bank, cash or petty cash account — or **On credit** to accrue (Cr Accrued Expenses 2300) and **Pay** it later from the register.

### Absorbing overheads into jobs
**Expenses & Costs → Overhead pool & absorption.** It shows the unabsorbed pool. Choose the amount, the basis (packs produced, direct labour, direct material or equal) and press **Preview split** then **Post absorption**: Dr Work In Progress (each job, Overhead) / Cr Overhead Absorbed (5290). Do this at month end so every pack carries its share of indirect cost.

### Cost analysis
**Cost analysis** tab: direct costs, indirect overhead (after absorption) and period expenses by head and nature for any period.

The expense head list is your chart of accounts (**Accounts → Chart of accounts**). A new expense account can be given a cost nature and behaviour so it classifies automatically.

## 11. Posting reference

| Event | Debit | Credit |
|---|---|---|
| Purchase of materials | 1300 Raw Material Stock | 2000 Trade Payables |
| Issue to job | 1310 WIP (Material) | 1300 Raw Material Stock |
| Daily production entry | 1310 WIP (Labour) | 2210 Accrued Piece-Rate Wages |
| Wage run — piece wages | 2210 | 2200 Wages Payable (with the rest of net pay) |
| Wage run — time wages | 1310 / 5270 overhead / 6050 admin | 2200 |
| EPF/ETF (employee + employer) | — (employer cost to job/overhead) | 2100 EPF/ETF Payable |
| Advance recovery | — | 1250 Employee Advances |
| Pay wages | 2200 | Bank / cash |
| Direct expense | 1310 WIP (job) | Bank / cash / 2300 |
| Indirect or period expense | Expense account | Bank / cash / 2300 |
| Overhead absorption | 1310 WIP (job, Overhead) | 5290 Overhead Absorbed |
| Release finished goods | 1320 Finished Goods | 1310 WIP |
| Delivery / sale | Cost of goods / Receivables | 1320 / 4000 Sales |

All entries are balanced and can never be edited or deleted — only reversed. Locked periods cannot be changed.

## 12. Reports

- **Trial Balance, Journal, Ledger** — the books.
- **Financial Reports** — Profit & Loss, Balance Sheet, **Production Account** (job costs, indirect overhead less absorption, admin, selling and finance), Cash Flow.
- **Profit by article/job, Budgets, Cash flow, Health check** — management reports.
- **Material Ledger, Daily Production summary, Employee Ledger, Expenses cost analysis** — operational detail.

## 13. Month-end close

Open **Reports → Month-end Close**. Every line must be green:

1. Trial balance is balanced.
2. Materials stock agrees with ledger 1300; finished goods with 1320.
3. WIP (1310) is explained by open jobs.
4. Piece wages (2210) agree with unpaid production entries.
5. All wage runs are paid; staff advances agree with ledger 1250.
6. Factory overhead pool is absorbed; accrued expenses are paid.
7. Supplier bills agree with payables 2000; no negative stock; every material has a purchase price.

Then do bank reconciliation, print reports, take a **backup**, and **Lock the period** on the same page (Owner). Nothing on or before the lock date can then change.

## 14. Routines

**Every day**
- Mark attendance.
- Issue materials by BOM for what starts today.
- Enter the day's production by worker, job, article/colour and operation.
- Record deliveries, receipts, petty cash and expenses.

**Every week**
- Run the Weekly wage run for piece and daily workers and pay it.
- Check Reorder & cover and place purchase orders.
- Pay suppliers; review payables ageing.

**Every month**
- Monthly wage run for salaried staff; recover advances; remit EPF/ETF.
- Post accrued expenses; absorb overhead; complete finished jobs.
- Month-end Close checklist, backup, lock the period.

## 15. Backup, Google Sheets and Firebase

- **Settings → Download backup** saves the active factory as a JSON file. Restore only into the same factory.
- **Cloud & Backup → Google Sheet** — each factory has its own sheet (README explains the Apps Script setup).
- **Cloud & Backup → Test connection** diagnoses sign-in, Firestore rules and sync problems in plain words.

## 16. Troubleshooting

| Problem | What to do |
|---|---|
| "No rate set for …" when saving production | Set the operation's standard rate or a rate override under Daily Production → Operations & rates |
| A job is missing in the production list | Only jobs In Progress appear; create or reopen the job |
| Wage run shows nobody | Log production, mark attendance, or choose Monthly for salaried staff |
| Recovery is more than the advance balance | Lower the recovery — the balance shown is what is owed |
| Material issue says insufficient stock | Receive the purchase first or reduce the quantity |
| Direct expense refused | Choose the job(s) and make shares total 100% |
| A check on Month-end Close is red | Click Open next to it; the detail line shows both figures |
| Cannot post — period is locked | An Owner can unlock the period on Month-end Close |

## 17. Recommended next features

These are natural next steps to make the system even stronger:

1. **Purchase orders and goods-received matching** with supplier price-variance reports.
2. **Landed cost** — spread freight and duty over the materials bought.
3. **Batch / lot numbers** for materials and finished goods, with traceability.
4. **Standard costing** — standard cost per article against actual with variance analysis.
5. **Production planning** — capacity per operation and a daily work-order sheet.
6. **Quality integration** — rejects per worker and operation deducted from piece earnings.
7. **Approval workflow** — high-value expenses, advances and wage runs need owner approval.
8. **Bank-feed import and auto-reconciliation.**
9. **Budget versus actual by expense head** with alerts.
10. **Customer credit control** — credit limits, overdue reminders by WhatsApp/SMS.
11. **Fixed-asset depreciation runs** posted monthly.
12. **Multi-currency** for imported materials.
13. **Mobile production-entry screen** for supervisors on the factory floor.
