import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { firebaseCredentials } from './config.js';

let firestore;

function firebaseApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(firebaseCredentials()) });
}

export function firebaseAuth() {
  return getAuth(firebaseApp());
}

export function firestoreDb() {
  if (!firestore) firestore = getFirestore(firebaseApp());
  return firestore;
}

export { FieldValue, Timestamp };

