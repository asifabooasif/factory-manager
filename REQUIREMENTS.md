# Lanka Slipper ERP - Requirements Checklist

Status: DONE = built and tested | NEW = added in this update | OPEN = not built yet (recommended next)

## A. Accounts: cash, bank and general ledger
| Requirement | Status | Where |
|---|---|---|
| Chart of accounts per factory | DONE | Cash & Bank Accounts - Chart of accounts |
| Add / rename / deactivate / delete accounts (bank, cash, loan, credit card, income, expense) | NEW | Chart of accounts tab |
| Several bank accounts with bank name, account no, branch | NEW | Chart of accounts tab |
| Cash in hand, petty cash (imprest), cash boxes | DONE / NEW | Petty Cash; Cash & Bank Accounts |
| Fund transfer, cash deposit, cash withdrawal, bank-to-bank | NEW | Vouchers - Transfer |
| Payment voucher (any expense, drawings, loan repayment with interest) with print and approval signatures | NEW | Vouchers - Payment |
| Receipt voucher (interest, owner capital, loan received, other income) | NEW | Vouchers - Receipt |
| Bank charges, interest earned, owner capital, owner drawings quick entries | NEW | Vouchers |
| Control accounts protected from manual vouchers (debtors, creditors, stock, WIP) so sub-ledgers stay exact | NEW | Vouchers |
| Cash book / bank book with opening, running balance, agreement check, CSV, print | NEW | Cash / Bank book |
| Daily cash count by note and coin, shortage/excess posted to Cash Over/Short | NEW | Cash count |
| Bank reconciliation against statement (any bank account) | DONE | Banking & Cheques |
| Post-dated cheques received and issued, clearing, bounced | DONE | Banking & Cheques |
| Customer receipts and supplier payments | DONE | Sales; Purchases |
| Manual journal, reversal only (no edit/delete), audit log | DONE | Journal; Settings |
| Period locking | DONE | Settings |
| Opening balances (cash, bank, debtors, creditors, stock) | DONE | Opening Balances |
| Trial balance, P&L, balance sheet, production account, cash flow | DONE | Reports |
| Fixed assets and depreciation, disposal | DONE | Fixed Assets |
| Budget vs actual | NEW | Reports |
| Cash-flow forecast | NEW | Reports |
| Loan register with instalment schedule and automatic interest | OPEN | - (loans can be handled with vouchers today) |
| Recurring vouchers (rent, lease, insurance) | OPEN | - |
| Tax: VAT / SVAT / withholding tax / NBT calculation and returns | OPEN | Settings has a switch, not yet connected |
| Bank statement import (CSV) with auto-matching | OPEN | - |
| Financial-year closing wizard | OPEN | Not needed for reports today: profit is computed from all entries |
| Multi-currency | OPEN | - |

## B. Factory operations
| Requirement | Status |
|---|---|
| Items, colours, sizes, SKU, EAN-13 barcodes, BOM | DONE |
| Customers and suppliers, credit limit and days, statements | DONE |
| Employees, payroll, EPF/ETF, advances, payslips | DONE |
| Purchases with stock-in, supplier returns, payables ageing | DONE |
| Jobs with costing, material issue, wastage, finished-goods release | DONE |
| Inventory with weighted-average cost, stock cards, adjustments | DONE |
| Delivery notes, invoices, credit notes, receivables ageing | DONE |
| Attendance and overtime | NEW |
| Quality control (reject rate, defect analysis) | NEW |
| Material planning from BOM vs stock | NEW |
| Quotations converting to jobs | NEW |
| Profitability by article, customer and job, reconciled to ledger | NEW |
| CSV import / export, barcode label printing | NEW |
| Dashboard with live KPIs and alerts | NEW |
| Purchase orders and goods-received notes | OPEN |
| Automatic payroll from attendance | OPEN |
| Physical stock-take sheets with variance posting | OPEN |
| Production stage tracking per pair (cutting, sticking, packing) with piece-rate wages | OPEN |

## C. System and security
| Requirement | Status |
|---|---|
| Offline use, installable app, automatic update | DONE |
| Cloud sync (Firebase) and Google Sheets copy | DONE |
| Backup and restore | DONE |
| Roles (Owner / Accountant / Viewer) inside the app | DONE |
| Real server-side permissions per role (today only the email allow-list in Firestore rules is enforced by the server) | OPEN |
| Approval workflow for large payments | OPEN |
| Daily automatic backup to Drive | OPEN |
