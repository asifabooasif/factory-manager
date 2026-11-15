/* APP_URL = the address where your ERP is hosted (GitHub Pages), e.g. https://yourname.github.io/factory-manager/
   The app loads your live website, so every web change reaches phones without a new APK. */
const url = process.env.APP_URL || '';
module.exports = {
  appId: 'lk.lankaslipper.erp',
  appName: 'Slipper ERP',
  webDir: 'www',
  server: url ? { url, cleartext: false, allowNavigation: ['*.firebaseapp.com', '*.googleapis.com', 'accounts.google.com', 'www.gstatic.com', new URL(url).hostname] } : undefined,
  android: { allowMixedContent: false },
  plugins: {
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com'] },
    FirebaseMessaging: { presentationOptions: ['badge', 'sound', 'alert'] },
    SplashScreen: { launchShowDuration: 1500, backgroundColor: '#2a1758', launchAutoHide: false },
    LocalNotifications: { iconColor: '#7c3aed' }
  }
};
