import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBcxYh6KJuBv3cF9A6x7kvrhYyer5-DGnc',
  authDomain: 'financas-ed7aa.firebaseapp.com',
  projectId: 'financas-ed7aa',
  storageBucket: 'financas-ed7aa.firebasestorage.app',
  messagingSenderId: '720876745733',
  appId: '1:720876745733:web:839ff246405a9bc122186c',
  measurementId: 'G-L3BL85F7PJ',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
