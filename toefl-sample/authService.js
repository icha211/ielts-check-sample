// authService.js
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export async function registerUser({
  email,
  password,
  firstName,
  lastName,
  country,
  phoneNumber = null // Optional parameter
}) {
  try {
    // 1. Create account in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Save profile fields to Cloud Firestore under doc ID = user.uid
    await setDoc(doc(db, "users", user.uid), {
      first_name: firstName,
      last_name: lastName,
      country: country,
      phone_number: phoneNumber || null,
      email: email,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });

    return { success: true, uid: user.uid };
  } catch (error) {
    console.error("Sign up error:", error.message);
    throw error;
  }
}