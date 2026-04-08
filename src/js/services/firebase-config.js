import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-f7KfWUq9bcusIHmqTpSDq0S-4rC7lqs",
  authDomain: "claro-ret.firebaseapp.com",
  projectId: "claro-ret",
  storageBucket: "claro-ret.firebasestorage.app",
  messagingSenderId: "218601890292",
  appId: "1:218601890292:web:31e30552518c20ff8d19a1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };
