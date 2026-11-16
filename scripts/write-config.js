/* Writes capacitor.config.json from the APP_URL variable, so the website address is certain to be inside the APK. */
const fs = require('fs'), path = require('path');
const url = (process.env.APP_URL || '').trim();
if (!/^https:\/\/.+/.test(url)) { console.error('APP_URL must start with https://  (got: "' + url + '")'); process.exit(1); }
const host = new URL(url).hostname;
const cfg = {
  appId: 'lk.lankaslipper.erp', appName: 'Slipper ERP', webDir: 'www',
  server: { url, cleartext: false, allowNavigation: [host, '*.firebaseapp.com', '*.googleapis.com', 'accounts.google.com', 'www.gstatic.com'] },
  android: { allowMixedContent: false },
  plugins: {
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
    FirebaseMessaging: { presentationOptions: ['badge', 'sound', 'alert'] },
    SplashScreen: { launchShowDuration: 1500, backgroundColor: '#2a1758', launchAutoHide: false },
    LocalNotifications: { iconColor: '#7c3aed' }
  }
};
for (const f of ['capacitor.config.js', 'capacitor.config.ts']) { const p = path.join(__dirname, '..', f); if (fs.existsSync(p)) fs.unlinkSync(p); }
fs.writeFileSync(path.join(__dirname, '..', 'capacitor.config.json'), JSON.stringify(cfg, null, 2));
console.log('capacitor.config.json written for ' + url);
