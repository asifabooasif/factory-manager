# Notification Center — Windows, Android and browser

One system gives you:

* **Alerts** worked out from your own data (no server needed): cheques due and past date, overdue customer invoices, supplier bills to pay, low stock, late jobs, quotations about to expire, production not logged, offline warning, and (Windows) old local backup.
* **Messages** from other people: an owner/accountant message to the team, and "goods released".
* **A bell** in the top bar with a red number, a panel with Alerts and Messages, and a settings screen: **System → Notification Center**.

## Where it shows up

| Device | What you get |
|---|---|
| Windows app | Windows pop-ups, a red number on the taskbar icon, a tray icon. Closing the window sends the app to the tray so alerts keep coming. Optional: start with Windows. Clicking a pop-up opens the right screen. |
| Android app | A daily digest scheduled on the phone (works with the app closed and offline), channels for Alerts / Reminders / Team messages, push for team messages (optional cloud function). Tapping opens the right screen. |
| Browser | Bell and panel; pop-ups while the page is open if you allow them. |

## Settings (per person, per device)
Alerts on/off, pop-ups on/off, sound, daily digest time, quiet hours (urgent ones still show), each alert on/off with its own number of days, "tell the other devices when I release goods". Read marks reset each day so open items remind you again.

## Install
1. Upload the files (see README-WHERE-TO-PUT.txt). Press Ctrl+Shift+R.
2. **Firebase → Firestore → Rules:** paste the new `firebase/firestore.rules` and Publish (needed for team messages).
3. **Windows:** run **Build Windows app** in GitHub Actions again and install the new `Slipper ERP Setup 1.1.0.exe` (use the installer, not the portable file, for pop-ups).
4. **Android:** no new APK is needed. Open the app once, then System → Notification Center → *Allow notifications* → *Send a test notification*.
5. Optional, phones with the app closed: deploy `functions/index.js` (Blaze plan) so team messages are pushed.

## Windows printing
The Windows shell now allows the print windows that invoices, delivery notes and reports open. Before, they were blocked. Rebuild the Windows app to get this.
