# Report Suite — Enterprise Reports

Open **Reports → Report Suite**. It holds **66 reports** in nine groups. The older *Financial Reports* and *Report Center* screens are still there, unchanged.

## What every report can do

| Feature | How |
|---|---|
| **Period** | Today, this/last month, this/last quarter, this/last financial year, last 12 months, all dates, or any custom dates |
| **Compare** | Profit & Loss, Production Account, Trading Account, Balance Sheet, Sales, Purchases and Expenses can show a second period (previous period / same period last year) with change and % change |
| **Filters** | Customer, supplier, item, article, category, account, job, employee, bank, source - whichever apply to the report |
| **Group by** | Most analysis reports switch between item, category, customer, month, job and more (for example Sales: article/colour, article, category, customer, month, job, customer × article) |
| **Columns** | ⚙ Customize → tick the columns you want; the table, print and Excel all follow |
| **Sort / search / top N** | Click any column heading to sort; type to search the lines; show only the top N |
| **Saved views** | 💾 Views stores the filters, grouping, columns and sorting under a name - for all devices |
| **Pin** | ☆ Pin puts a report at the top of the list |
| **Drill down** | Click a line to open what is behind it: account → ledger → journal entry; party → statement; item → stock card; job → job cost sheet |
| **Output** | Print / PDF (with your factory logo), Excel (.xls) and CSV; optional print heading |

## Accuracy: every report proves itself

Reports are built only from the ledger (journal entries), the stock moves and the document records. Where a figure has a control account, the report shows a green tick or a red cross:

| Report | Proved against |
|---|---|
| Trial Balance | Debits = credits |
| Balance Sheet | Assets = equity + liabilities, at both dates when comparing |
| Trading Account | Cost of sales = account 5400 |
| Cash Flow | Opening + movement = cash & bank (direct and indirect methods agree) |
| Receivables / Payables Ageing | Open invoices = 1200; open bills = 2000 |
| Stock Valuation / Movement / Value by Source | Materials = 1300, finished goods = 1320 (also at the opening date) |
| Sales Analysis | Gross sales less returns = 4000; discounts = 4010; cost = 5400 |
| Purchase Analysis | Net purchases = stock received |
| Production Account | Raw material, WIP and finished goods roll-forwards; WIP = sum of jobs (1310); transfers = finished goods received |
| WIP, Production Output, Piece wages, Advances, Assets, Loans, Unbilled | 1310, 1320, 2210, 1250, 1400/1410, loan accounts, 1210 |
| Master Reconciliation | Every sub-ledger against its control account |

These ties were checked on test data for more than 900 report/option combinations and 16 different date windows (including windows that split a sale from its later cancellation) with no differences.

### How cancelled and returned documents are treated
The ledger reverses a cancelled delivery, invoice or bill **on the day it was cancelled**. Reports do the same - the original on its own date and the reversal on the cancel date - so any period you pick agrees with the ledger.

## The reports

### 📈 Financial statements

| Report | What it shows | Options |
|---|---|---|
| **Trial Balance** | Every account with opening, period movement and closing balance. Choose a plain closing list, or the full movement format. | period; format; group by; zero balances; group by: group by account type / one list by code; format: closing balances only / opening + period + closing |
| **Profit & Loss Statement** | Income, cost of sales, gross profit, expenses by nature and net profit - with % of sales and an optional comparison period. | period; compare with previous period / last year; detail on/off |
| **Monthly Profit & Loss** | Month-by-month income, cost of sales, expenses and profit across the period, with a total column. | period; detail on/off |
| **Trading Account** | Opening stock + purchases + direct costs - closing stock = cost of sales, checked against the Cost of Goods Sold account. | period; compare with previous period / last year |
| **Balance Sheet** | Assets, liabilities and equity as at a date, with an optional comparison date and a balance check. | as-at date; compare with earlier date; detail on/off |
| **Cash Flow Statement** | Where cash came from and went: direct method by source, indirect method from profit, or per bank account. | period; format; bank account; format: direct method (receipts and payments) / indirect method (profit to cash) / by cash & bank account |
| **Financial Ratio Analysis** | Liquidity, profitability, efficiency (debtor, creditor, stock days) and leverage ratios worked out from the ledger. | period |
| **General Ledger (Account Ledger)** | Every entry on one account with running balance, job, source and narration. Click an entry to see the whole journal entry. | period; account; source; job |
| **Day Book / Journal Register** | Every journal entry in date order, as ledger lines or one row per entry. Filter by source, account or job. | period; group by; source; account; job; group by: every ledger line / one row per entry |
| **Cash & Bank Book** | Every receipt and payment through cash and bank accounts with running balance, by source or account. | period; bank account; source |

### 🧾 Receivables & payables

| Report | What it shows | Options |
|---|---|---|
| **Receivables Ageing (Customers)** | What every customer owes, by invoice date, due date and days overdue, with credit limit use. Any date, any bucket size. | customer; as-at date; bucket size (days); count days from; detail on/off |
| **Payables Ageing (Suppliers)** | What you owe every supplier, by bill date, due date and days overdue. Any date, any bucket size. | supplier; as-at date; bucket size (days); count days from; detail on/off |
| **Customer / Supplier Statement** | Complete transaction statement of one customer or supplier - invoices, receipts, cheques, returns - with running balance. | period; party |
| **Party Balances List** | Every customer and supplier with opening, debits, credits and closing balance for the period. | period; group by; zero balances; group by: customers and suppliers / customers only / suppliers only |
| **Customer Sales vs Collection** | For each customer: net sales, receipts, balance and how many days of sales are outstanding (collection performance). | period |
| **Collections Register (Receipts)** | Every receipt and customer cheque received in the period - by customer, bank, month or as a list. | customer; period; group by; group by: every transaction / by customer / by month / by bank / cash account |
| **Payments Register (Suppliers)** | Every supplier payment and cheque issued in the period - by supplier, bank, month or as a list. | supplier; period; group by; group by: every transaction / by supplier / by month / by bank / cash account |
| **Post-Dated Cheque Maturity Schedule** | Cheques in hand and cheques issued that have not cleared, grouped by how soon they mature - plan your cash. | party; direction; group by: cheque list / maturity buckets |
| **Cheque Register (all statuses)** | Every cheque received or issued with status, clearing or return date and reason. Includes returned cheques. | period; party; direction; status |
| **Credit Control & Overdue Customers** | Customers over their credit limit or with overdue invoices, ranked by amount overdue - for collection follow-up. | as-at date |

### 📦 Inventory & stock

| Report | What it shows | Options |
|---|---|---|
| **Stock Valuation Report** | Quantity, average cost and value of every item as at any date - by item, category or stock type - checked against the ledger. | as-at date; group by; material; category; stock type; zero balances; group by: item / colour wise / category wise (summary) / stock type wise (summary) / category with item detail and sub-totals |
| **Stock Value by Source (what the value is made of)** | Opening stock + each source of stock value in the period (purchases, production, returns, adjustments) - each issue and sale - to closing stock. | period; group by; material; category; stock type; format; group by: item / colour wise / category wise (summary) / stock type wise (summary); format: value (rs) / quantity |
| **Stock Movement Summary** | Opening, received, issued and closing quantity and value for every item in the period. | period; group by; material; category; stock type; zero balances; group by: item / colour wise / category wise (summary) / stock type wise (summary) |
| **Item Stock Card (Stock Ledger)** | Every movement of one item - with the supplier, customer or job it came from or went to - quantity and value balance after each line. | period; item; job |
| **Reorder & Low Stock Report** | Materials, accessories and packing below their minimum, with average daily usage, days of cover and the quantity to order. | category; usage look-back (days); lead time (days); show |
| **Stock Ageing & Slow-Moving Stock** | How old the stock on hand is (first-in-first-out layers) and which items have not moved - to find dead and slow stock. | as-at date; material; category; stock type |
| **Material Consumption Report** | Materials issued to production (and returned) by material, job or month - quantity, value and average cost. | period; group by; material; job; category; group by: by material / by job / by month / job × material |
| **Finished Goods Stock (Article & Colour)** | Packs and pairs of every article and colour in stock, with cost per pack and per pair, last selling rate and margin on current stock. | as-at date; article; category |
| **Stock-Take Variance Report** | Counted vs system quantity from every stock take, with the variance and its value. | period; status |

### 🛒 Sales

| Report | What it shows | Options |
|---|---|---|
| **Sales Analysis - Item Wise** | Net sales, cost and gross profit of every article and colour: packs, pairs, returns, discounts, average rate, share and margin. | period; compare with previous period / last year; group by; customer; article; category; job; group by: article / colour / article (all colours) / category / customer / month / job / customer × article |
| **Sales Analysis - Category Wise** | Sales, cost and profit by category (Flat, PU ...) with comparison to an earlier period. | period; compare with previous period / last year; group by; customer; article; category; job; group by: category / article / colour / article (all colours) / customer / month / job / customer × article |
| **Sales Analysis - Customer Wise** | Sales, margin and share by customer. Click a customer to open the statement. | period; compare with previous period / last year; group by; customer; article; category; job; group by: customer / article / colour / article (all colours) / category / month / job / customer × article |
| **Sales Trend by Month** | Month-by-month net sales, quantity or profit for every article, category or customer, with a total column. | period; group by; format; customer; article; category; group by: by article / by category / by customer / by article / colour; format: net sales / net pairs / gross profit |
| **Customer × Article Sales Matrix** | Net sales of each customer across the leading articles - see who buys what. | period; articles to show; customer |
| **Sales Register (Delivery Notes, Invoices, Returns)** | Every delivery note, invoice or credit note in the period with customer, job, values, profit, due date and status. | period; format; customer; job; format: delivery notes / invoices / credit notes (sales returns) |
| **Delivered but Not Invoiced** | Delivery notes still waiting to be invoiced (ledger 1210), oldest first, with days waiting. | customer |
| **Selling Price & Margin Analysis** | For every article and colour: lowest, average, highest and latest selling rate per pair against cost per pair; sales below cost. | period; article; category; customer |

### 🚚 Purchases

| Report | What it shows | Options |
|---|---|---|
| **Purchase Analysis** | What you bought - by material, category, supplier or month: quantity, value, lowest / average / highest / latest rate and price movement. | period; compare with previous period / last year; group by; supplier; material; category; group by: material / accessory / category / supplier / month / supplier × material |
| **Supplier Price Comparison** | For each material, what every supplier charged: lowest, average, highest and latest rate - find the cheapest source. | period; material; supplier |
| **Purchase Register (Bills & Returns)** | Every goods-received bill or purchase return with supplier invoice, GRN, due date, amount paid and balance. | period; format; supplier; format: purchase bills / purchase returns (debit notes) |
| **Supplier Purchases vs Payments** | For each supplier: net purchases, payments, closing balance and days of purchases outstanding. | period |

### 🏭 Production & costing

| Report | What it shows | Options |
|---|---|---|
| **Production Account (Manufacturing Statement)** | The complete factory cost story: materials, labour and overhead into work-in-progress, cost of goods manufactured, finished goods and cost of sales - every stage proved against the ledger. | period; compare with previous period / last year; detail on/off |
| **Job Costing Summary (all jobs)** | Every job: progress, material, labour, overhead, total cost, value released, WIP balance, cost per pack and pair, and the sales profit earned on it. | period; customer; job status |
| **Job Cost Sheet (single job)** | One job in full: cost by article and colour, materials issued, labour by operation and worker, and every ledger posting. | job; format; format: cost by article / colour / materials issued / labour by operation & worker / every cost posting |
| **Work-in-Progress Statement** | Cost sitting in unfinished jobs as at a date, by job and cost type, with days open and last activity - proved against ledger 1310. | as-at date; customer; zero balances |
| **Production Output Report** | Packs and pairs completed (released to finished goods) by article, colour, category, job, day or month, with value and cost per pack and pair. | period; group by; article; category; job; group by: article / colour / article / category / job / month / day |
| **Operation-wise & Worker-wise Production Wages** | Piece-rate production by operation, worker, article, job, day or month: packs, pairs, wages, average rate and paid/accrued status. | period; group by; employee; job; article; group by: operation / worker / operation × worker / article / colour / job / month / day |
| **Factory Overhead Analysis** | Indirect factory costs by account or behaviour (fixed / variable), absorbed into jobs versus incurred, and the cost per pack. | period; group by; group by: by account / by behaviour (fixed / variable / semi) / by month - incurred vs absorbed |
| **Wastage & Factory Loss Report** | Every wastage, damage and stock-loss write-off to Factory Loss (5300): by entry, job, month or source, as a share of material used. | period; group by; job; group by: every entry / by job / by month / by source |
| **BOM Standard vs Actual Material Usage** | Material that should have been used (bill of materials x pairs started) against material actually issued, per job - overuse and savings in quantity and value. | job; material |
| **Cost per Pack Trend (Monthly)** | Month by month: materials, labour and overhead charged to jobs, packs completed and the factory cost per pack and per pair. | period |
| **Quality & Reject Report** | Inspections by article, job, stage, defect or month: pieces inspected, rejected and reject rate. | period; group by; job; group by: article / colour / job / stage / defect / month |
| **Contribution & Break-even Analysis** | Splits costs into variable and fixed (from each account’s behaviour setting) to show contribution, break-even sales and margin of safety. | period; semi-variable costs treated as variable % |

### 👷 People & payroll

| Report | What it shows | Options |
|---|---|---|
| **Payroll Register** | Every payroll run with gross pay, EPF, ETF, advance and loan recoveries and net pay - or every employee line of every run. | period; format; employee; format: one row per payroll run / one row per employee per run |
| **Employee Earnings Summary** | What each employee earned in the period: basic, piece-rate, overtime, bonus, gross, deductions and net. | period; employee |
| **EPF & ETF Statement** | Employee EPF, employer EPF and ETF for each employee and month, with the amount still owed to the authorities (ledger 2100). | period; group by; group by: by employee / by month |
| **Attendance Summary** | Days present, half days, absent, leave and overtime hours for every employee in the period. | period; employee |
| **Employee Advances & Staff Loans** | Balance of salary advances and staff loans for every employee, proved against Employee Advances (ledger 1250). | zero balances |
| **Labour Cost per Pack (Monthly)** | Labour charged to jobs each month, payroll gross, packs completed and labour cost per pack. | period |

### 💼 Expenses, assets & funding

| Report | What it shows | Options |
|---|---|---|
| **Expense Analysis** | All expenses by account, nature (factory / admin / selling / finance), behaviour (fixed / variable) or month, as % of sales, with comparison period. | period; compare with previous period / last year; group by; nature; group by: by account / by nature / by behaviour / account × month |
| **Budget vs Actual** | Monthly budgets against actual figures for the accounts you budgeted, with variance and a over / under flag. | period |
| **Fixed Asset Register & Depreciation** | Every asset with cost, accumulated depreciation and net book value, by category, proved against ledger 1400 / 1410. | group by; status; group by: every asset / by category |
| **Loan Register & Repayment Schedule** | Every loan with principal outstanding, next instalment, overdue instalments and interest paid; or the full instalment schedule. | format; format: loan summary / every instalment |

### 🛡️ Control & audit

| Report | What it shows | Options |
|---|---|---|
| **Master Reconciliation (Books vs Records)** | Every sub-ledger proved against its control account: receivables, payables, stock, WIP, cheques, wages, advances - plus entry balance and negative stock. |  |
| **Abnormal Balances & Exceptions** | Accounts, parties, stock and jobs whose balance is the wrong way round or doesn’t make sense - overdrawn banks, credit-balance customers, negative stock, finished jobs holding WIP. |  |
| **Audit Trail** | Who changed what and when: every create, edit and cancellation recorded by the system, filterable by user, record type and action. | period; user; record type |

## Notes and limits

* **Ageing for past dates.** For today the ageing uses the live open invoices and bills. For an earlier date the party's ledger balance on that date is aged first-in-first-out against its invoices, so any date can be reported.
* **Contribution & break-even** treats cost of goods sold as variable; set each account's behaviour (fixed / variable / semi) in the chart of accounts for sharper results.
* **Balance Sheet** shows loans in full; the part due within 12 months is not split out.
* **Saved views and pins** are stored in the factory settings; a view-only user cannot save them.
* Reports never change any data.
