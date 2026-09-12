const admin = require('firebase-admin');
const {initializeApp, getApps, cert} = require('firebase-admin/app');
const {getMessaging} = require('firebase-admin/messaging');

const getFirebaseServiceAccount = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
  }

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    } catch (error) {
      throw new Error(`Unable to decode Firebase service account: ${error.message}`);
    }
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Firebase service account is missing required fields');
  }

  return serviceAccount;
};

const initializeFirebase = () => {
  if (getApps().length > 0) {
    return admin;
  }

  const serviceAccount = getFirebaseServiceAccount();

  initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
    }),
  });

  console.log('Firebase initialized:', serviceAccount.project_id);

  return admin;
};

const firebaseApp = initializeFirebase();
firebaseApp.messaging = getMessaging;

module.exports = firebaseApp;
