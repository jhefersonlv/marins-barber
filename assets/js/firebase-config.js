/* ═══════════════════════════════════════════════════════════════
   Marins Barber ─ Firebase Config
   Conectado ao Orbit Tools (WordVirtua) como tenant
   ═══════════════════════════════════════════════════════════════ */

/*
 * UID do Tenant no Orbit Tools.
 * Para encontrar: abra o Orbit Tools → Admin → localize Pedro Marins na tabela → copie o UID da URL ou exibido no modal.
 * Alternativa: Firebase Console → Authentication → Users → copie o User UID da conta de Pedro Marins.
 */
const TENANT_UID = 'pjk70Jv4anW2ve4aWFdb8dqCpSv2'; // ← VERIFIQUE se este UID bate com a conta no Orbit Tools

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCMl29LbQqrqqPQR8EKa1g8Cm4rHUwLWJA',
  authDomain: 'orbit-tools-35189.firebaseapp.com',
  projectId: 'orbit-tools-35189',
  storageBucket: 'orbit-tools-35189.firebasestorage.app',
  messagingSenderId: '4218159323',
  appId: '1:4218159323:web:bb017b569353468b4a4cfe',
};

firebase.initializeApp(FIREBASE_CONFIG);

const db = firebase.firestore();
const auth = firebase.auth();
