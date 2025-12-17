import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';

let db: any = null;

// Initialize Firebase with config provided by user
export const initFirebase = (config: any) => {
  try {
    // Check if app already initialized (simplified for this context)
    const app = initializeApp(config);
    db = getFirestore(app);
    console.log("Firebase Initialized Successfully");
    return true;
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
    return false;
  }
};

// Try to load config from localStorage on startup
const savedConfig = localStorage.getItem('pos_firebase_config');
if (savedConfig) {
  try {
    initFirebase(JSON.parse(savedConfig));
  } catch (e) {
    console.error("Invalid saved firebase config");
  }
}

export { db, collection, addDoc, updateDoc, deleteDoc, doc, setDoc };

// Helpers for data conversion
export const convertDate = (date: any) => {
    // Helper if we need to convert Firestore timestamps
    return date; 
};