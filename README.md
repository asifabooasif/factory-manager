# Lanka Slipper ERP

Open `index.html` to run. Works offline; data is saved in your browser. Use **Cloud & Backup → Download backup** regularly.

## 1. Put it on GitHub (free website)
1. Go to github.com, sign in, click **New repository**, name it `lanka-slipper-erp`, choose **Public**, click **Create**.
2. Click **uploading an existing file**, drag in everything INSIDE this folder (index.html, manifest.json, sw.js, README.md and the folders css, js, icons, apps-script, firebase). Click **Commit changes**.
3. Go to **Settings → Pages**, set **Branch: main**, folder **/ (root)**, click **Save**.
4. After about a minute your system is at `https://YOURNAME.github.io/lanka-slipper-erp/`.
5. To update later: upload the changed files the same way (they replace the old ones).

## 2. Turn on cloud sync (Firebase) — optional
1. Open console.firebase.google.com and your project **factory-manager-1b5fa**.
2. **Build → Authentication → Get started → Google → Enable → Save.**
3. Authentication → **Settings → Authorized domains → Add domain**: `YOURNAME.github.io`.
4. **Build → Firestore Database → Create database** (production mode).
5. Firestore → **Rules**: paste the contents of `firebase/firestore.rules`, put your own email address(es) in the list, click **Publish**.
6. In the system open **Cloud & Backup → Turn cloud sync on → Sign in with Google**. Do this once per device. Existing data uploads automatically.

## 3. Google Sheets copy — optional
1. Create a Google Sheet, open **Extensions → Apps Script**, delete the sample code, paste `apps-script/sheets-sync.gs`, change `CHANGE_THIS_SECRET` to your own secret word.
2. Click **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone**, click **Deploy**, copy the Web App URL.
3. In the system: **Cloud & Backup**, paste the URL and the same secret, click **Save**, then **Send all existing data now**.

## 4. Install as an app
Open your GitHub link in Chrome or Edge and click the install icon in the address bar (on a phone: browser menu → Add to Home screen). It then opens like an app and works offline.

## Good habits
- Enter data on one device at a time so document numbers stay in order.
- Never edit posted entries; use Reverse or the Cancel buttons.
- Check **Health Check** weekly and download a backup.

## What's new (Parts 13-15)
- **Dashboard**: real KPIs (sales this month, receivables, payables, stock value, jobs, cheques), 6-month income vs expenses chart, low-stock list, overdue jobs, cheques due in 7 days.
- **Attendance** (Factory menu): daily sheet (Present / Half day / Absent / Leave + overtime hours) and a monthly summary you can download or print to help prepare payroll. It does not post to the accounts.
- **Quality Control** (Factory menu): record inspections per job, article and stage; see reject rate and most common defects. Information only.
- **Import / Export** (System menu): export any list to CSV for Excel; import customers/suppliers and items from CSV (templates provided); print EAN-13 barcode labels for finished-good SKUs.

After updating, upload ALL changed files to GitHub (including index.html, sw.js and js/core/config.js). The browser upgrades its database automatically the first time you open the new version; your existing data is kept.

## What's new (Parts 16-20)
- **Material Planning** (Factory): for jobs in progress, materials still needed (BOM x pairs, less what is already issued) vs stock, with exact shortage, estimated cost, last supplier, and how many pairs current stock can make. Needs a BOM on your finished-good items.
- **Quotations** (Factory): price an enquiry with live margin against current cost (warns if below cost), print it, track Sent / Accepted / Rejected / Expired, and convert to a Job in one click.
- **Cash Forecast** (Reports): week-by-week projected bank balance from unpaid invoices (using credit days), unpaid bills, and pending cheques, with optional salary estimate and fixed costs. Flags any week that goes negative.
- **Profitability** (Reports): real margin by article, customer and job, after invoice discounts and sales returns, reconciled to ledger account 4000 with an Agrees / Differs check.
- **Budget vs Actual** (Reports): set monthly budgets per income/expense account, compare with the ledger for the month or year-to-date.

Upload ALL changed files (index.html, sw.js, js/core/config.js and the new js/modules files). Download a backup first.

## What's new (Part 21): Cash & Bank Accounts
Open **Cash & Bank Accounts** (Accounting menu). Tabs: Accounts overview, Vouchers (payment, receipt, transfer/deposit, bank charges, interest, owner capital/drawings), Cash / Bank book, Cash count, Chart of accounts (add bank, cash, loan and credit-card accounts). See REQUIREMENTS.md for the full checklist of what is done and what is still open.
Upload all changed files: index.html, sw.js, js/core/config.js, js/core/ledger.js and js/modules/accounts.js. Download a backup first.
