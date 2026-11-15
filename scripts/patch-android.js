/* Run after "npx cap add android" / "cap sync": adds the notification permission and sets the app version from version.json. */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'android');
if (!fs.existsSync(root)) { console.log('No android folder yet. Run: npx cap add android'); process.exit(0); }
const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).android;
const mf = path.join(root, 'app/src/main/AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
for (const p of ['android.permission.POST_NOTIFICATIONS', 'android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.RECEIVE_BOOT_COMPLETED'])
  if (!m.includes(p)) m = m.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
fs.writeFileSync(mf, m);
const gf = path.join(root, 'app/build.gradle');
let g = fs.readFileSync(gf, 'utf8');
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + v.versionCode).replace(/versionName\s+"[^"]*"/, 'versionName "' + v.versionName + '"');
fs.writeFileSync(gf, g);
console.log('Patched: versionCode', v.versionCode, 'versionName', v.versionName);
