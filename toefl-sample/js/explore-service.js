import { auth } from "./firebase-config.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
const functions = getFunctions(auth.app, "asia-southeast1");
export const getExploreFeed = async mode => (await httpsCallable(functions, "getExploreFeed")({ mode })).data;
export const saveExplorePreferences = async input => (await httpsCallable(functions, "saveExplorePreferences")(input)).data;
