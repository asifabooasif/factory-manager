# v100 - "my changes do not show" fix: visible version, update detector, always-fresh files

Your repository (v99) was checked: every file in index.html and sw.js exists, no syntax errors, and suites 1-4 (60/27/19/43) and the
explorer test (7) all pass in a real browser. So the code itself is complete. What was missing was a way to SEE which version a device
is really running, and a guarantee that a new upload is used straight away.

## What changed
- js/modules/appupdate.js (new): version badge in the top bar (v100). It asks the server for sw.js (never from cache); if the server has a
  newer version than the files this device runs, the badge turns red "Update vNNN" and a message appears. Tap the badge = clear the
  offline copy and reload the newest files (your data is not touched).
- sw.js: v100. Every file is re-checked with the server on each load (no more waiting for a stale 10-minute copy after an upload).
- index.html: loads appupdate.js.
- tests/update-check.js (new): proves badge, stale detection, immediate use of a changed file, and force update (6 checks).

## How to check what your live site serves (30 seconds)
1. Open  https://YOUR-SITE/sw.js  - the second line must say  const V = 'lanka-erp-v100'.
2. Open  https://YOUR-SITE/js/modules/txn.js  and search the page for  Alt+L  - it must be found.
   If either is missing, the upload did not reach the site (GitHub: the files were not committed, or the wrong branch, or the Pages
   deployment is still running - see the Actions tab).
3. Open the app and look at the top bar: it must show v100. Red "Update ..." = tap it.
