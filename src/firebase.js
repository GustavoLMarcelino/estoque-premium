// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAnalytics }    from "firebase/analytics";
import { getFirestore }    from "firebase/firestore";
import { getAuth }         from "firebase/auth";    // ← importe o getAuth

const firebaseConfig = {
  apiKey: "AIzaSyCCIJNAJ-5PuhsSNVqHRQxO6qp_cMwAYeY",
  authDomain: "estoque-premium-dgpglm.firebaseapp.com",
  projectId: "estoque-premium-dgpglm",
  storageBucket: "estoque-premium-dgpglm.firebasestorage.app",
  messagingSenderId: "368289291438",
  appId: "1:368289291438:web:b8256cc63d2212e931613f",
  measurementId: "G-JTT2YC9JCR"
};


const app       = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db        = getFirestore(app);
const auth      = getAuth(app);                  // ← inicialize o Auth

// Exporte TAMBÉM o auth
export { db, auth, analytics };
