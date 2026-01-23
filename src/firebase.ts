import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// TODO: Udfyld fra Firebase Console -> Project settings -> Your apps -> SDK setup and configuration
const firebaseConfig = {
  apiKey: 'AIzaSyC5q7l156xwphjtUPM4Jqz4dAi6HZ7W7_4',
  authDomain: 'fcn-app-fb985.firebaseapp.com',
  projectId: 'fcn-app-fb985',
  storageBucket: 'fcn-app-fb985.firebasestorage.app',
  messagingSenderId: '373991311744',
  appId: '1:373991311744:web:7807a0e730e61bbc8e5965',
};

// Undgå at initializeApp kører flere gange (hot reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
