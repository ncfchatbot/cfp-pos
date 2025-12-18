import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy } from 'firebase/firestore';

let db: any = null;

export const initFirebase = (config: any) => {
  if (!config) return false;
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(config);
    db = getFirestore(app);
    console.log("Firebase Initialized Successfully");
    return true;
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
    return false;
  }
};

// 1. ตรวจสอบค่าจาก Environment Variable (Netlify/Vercel/Vite env)
// 2. หากไม่มี ให้ตรวจสอบจาก LocalStorage (สำหรับ Manual Setup)
const globalConfigStr = (process.env as any).FIREBASE_CONFIG;
const savedConfigStr = localStorage.getItem('pos_firebase_config');

if (globalConfigStr) {
    try {
        const config = typeof globalConfigStr === 'string' ? JSON.parse(globalConfigStr) : globalConfigStr;
        initFirebase(config);
    } catch (e) {
        console.error("Global Firebase config parse error", e);
    }
} else if (savedConfigStr) {
    try {
        initFirebase(JSON.parse(savedConfigStr));
    } catch (e) {
        console.error("Invalid saved firebase config");
    }
}

export { db, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy };