import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    GoogleAuthProvider,
    getAuth
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBtaZOok-Kj91qzCo_6ClCZ8Lfgam7qRxg",
    authDomain: "quickcheck-25590.firebaseapp.com",
    databaseURL: "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "quickcheck-25590",
    storageBucket: "quickcheck-25590.firebasestorage.app"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();