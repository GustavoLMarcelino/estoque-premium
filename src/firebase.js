// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCCIJNAJ-5PuhsSNVqHRQxO6qp_cMwAYeY",
  authDomain: "estoque-premium-dgpglm.firebaseapp.com",
  projectId: "estoque-premium-dgpglm",
  storageBucket: "estoque-premium-dgpglm.firebasestorage.app",
  messagingSenderId: "368289291438",
  appId: "1:368289291438:web:b8256cc63d2212e931613f",
  measurementId: "G-JTT2YC9JCR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db };