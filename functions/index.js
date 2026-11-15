/* Optional: sends a push message to the phones when someone is sent a message from the Notification Center
   (or when goods are released). Phones with the app OPEN or on a Windows PC already get it without this.
   Deploy: firebase deploy --only functions   (needs the Blaze plan; light use is within the free quota)
   Messages marked "Owner and accountants only" are not pushed (a phone cannot tell who is an accountant). */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();
exports.broadcast = onDocumentCreated('erp_notify/{id}', async e => {
  const d = e.data.data();
  if (d.to === 'managers') return;
  const urgent = d.level === 'critical';
  await admin.messaging().send({
    topic: 'all',
    notification: { title: d.title || 'Lanka Slipper ERP', body: d.body || '' },
    data: { nid: e.params.id, route: d.route || '', factoryId: d.factoryId || '' },
    android: { priority: 'high', notification: { channelId: urgent ? 'alerts' : 'team', sound: 'default' } }
  });
});
