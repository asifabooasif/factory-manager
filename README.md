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
