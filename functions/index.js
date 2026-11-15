/* Optional: sends a push message to every phone when the owner uses "Send to all devices" in the app.
   Deploy: firebase deploy --only functions   (needs the Blaze plan; light use is within the free quota) */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();
exports.broadcast = onDocumentCreated('erp_notify/{id}', async e => {
  const d = e.data.data();
  await admin.messaging().send({ topic: 'all', notification: { title: d.title || 'Lanka Slipper ERP', body: d.body || '' }, android: { priority: 'high' } });
});
