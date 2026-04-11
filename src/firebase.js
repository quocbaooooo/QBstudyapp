import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBz1xOy83_iLTPOspzSRSMHAzzivDV_bFQ",
  authDomain: "neurostudy-app.firebaseapp.com",
  projectId: "neurostudy-app",
  storageBucket: "neurostudy-app.firebasestorage.app",
  messagingSenderId: "744750139203",
  appId: "1:744750139203:web:ef6e2537c41da7170691f6",
  measurementId: "G-4N8QPDN7FR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export default app;
