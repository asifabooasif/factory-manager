NOTIFICATION CENTER UPDATE (cache v79). The folders in this zip are the same as in your repo.
Unzip, then drag the folders and files into GitHub (Add file > Upload files). Existing files are overwritten.

REPLACE (already in your repo)
  index.html                 main folder
  sw.js                      main folder
  firebase/firestore.rules   -> after uploading, ALSO paste it in Firebase > Firestore > Rules and Publish
  functions/index.js         optional push for phones (only needed if you deploy functions)
  js/native.js               inside js
  windows/main.js            inside windows   -> rebuild the Windows app
  windows/preload.js         inside windows   -> rebuild the Windows app
  windows/package.json       inside windows   -> rebuild the Windows app (version 1.1.0)

NEW
  js/modules/notify.js       inside js/modules  - the Notification Center
  NOTIFICATIONS.md           main folder        - short guide

Then: GitHub > Actions > Build Windows app > Run workflow, and install "Slipper ERP Setup 1.1.0".
Android needs no new APK: open the app, then System > Notification Center > Allow notifications > Send a test notification.
