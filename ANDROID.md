# Lanka Slipper ERP – Android app

The app is a thin Android shell around your website. It loads your live GitHub Pages address, so **every web change reaches phones without a new APK**. A new APK is only needed to change the native parts (icon, permissions, plugins).

## What was added (copy these into your repo, keep your other files)
| File | Purpose |
|---|---|
| `css/mobile.css`, `js/mobile.js` | Phone layout: slide-out menu, bottom tabs, stacked entry rows, full-screen pop-ups |
| `js/native.js` | Native Google sign-in, reminders, push registration, update check, back button, **System > Mobile & Notifications** screen |
| `index.html`, `sw.js` (v72) | Link the new files, bump the cache |
| `firebase/firestore.rules` | Adds `erp_devices` and `erp_notify`. **Publish the rules again** |
| `package.json`, `capacitor.config.js`, `www/`, `scripts/patch-android.js`, `.github/workflows/android.yml` | Builds the APK in GitHub (no Android Studio needed) |
| `version.json` | Tells installed apps when a new APK exists |
| `functions/` | Optional: "send to all phones" |

## One-time setup
1. **Firebase console > Project settings > Add app > Android.** Package name: `lk.lankaslipper.erp`. Add the **SHA-1** of your signing key (the workflow's debug build prints one; or use `keytool -list -v -keystore your.jks`). Download `google-services.json`.
2. **Authentication > Sign-in method > Google:** already on. Make sure the Android app's SHA-1 is registered, or Google sign-in fails with error 10.
3. In GitHub: **Settings > Secrets and variables > Actions**
   - Variable `APP_URL` = your site address, e.g. `https://NAME.github.io/REPO/`
   - Secret `GOOGLE_SERVICES_JSON_B64` = `google-services.json` converted to base64 (`base64 -w0 google-services.json`)
   - Optional, for a properly signed release APK: `KEYSTORE_B64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. Without them you get a debug-signed APK, which installs fine for your own staff.
4. **Actions tab > Build Android app > Run workflow.** Download the APK from the run's artifacts and install it on the phone (allow "install unknown apps").
5. Publish `firebase/firestore.rules` in the Firebase console.

## Notifications
- **Reminders on the phone** (no server): cheques due within 3 days at 9:00, and an optional daily "log production" reminder. Switch them on in **System > Mobile & Notifications**.
- **Push messages to every phone** (optional): deploy `functions/` (`firebase deploy --only functions`, needs the Blaze plan). Then the Owner can type a message in the same screen. Without the function, the app still works; only broadcast is unavailable.

## Updates
- **Web changes:** push to GitHub. Phones get the new version on next open (the app shows "Update ready, tap to reload").
- **New APK:** raise `versionCode` in `version.json`, set `url` to where the APK is (e.g. the GitHub release page), rebuild. Installed apps show an update prompt. Set `minVersionCode` to force it.

## Not yet verified (be aware)
I could not build an APK or run an Android phone here. The phone layout and the new scripts were loaded in a phone-size browser only; native sign-in, push and reminders are untested. Test on one phone: sign in, rotate, back button, a test notification, and one full entry such as a daily production log.

---
# Windows app
1. Make sure the GitHub variable `APP_URL` is set (same as Android).
2. **Actions > Build Windows app > Run workflow.** Download `slipper-erp-windows` from the run. It holds an installer (`Slipper ERP Setup ... .exe`) and a portable `.exe` that needs no install.
3. Install it on the Windows PC and sign in with Google.
Like the Android app, it opens your live website, so web changes arrive automatically. Windows may show a "SmartScreen" warning for an unsigned app: choose More info > Run anyway. If Google refuses the sign-in inside this window, use the no-build route below.

**No-build route (works today):** open your site in Chrome or Edge on the PC, then use the install icon in the address bar (or menu > Install app). It gets its own window and desktop icon and works offline.
