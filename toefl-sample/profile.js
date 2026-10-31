import { auth, db } from "./js/firebase-config.js";
import { signOutAndRedirect, resolveDisplayName } from "./js/account-menu.js?v=20261030-prefs";
import { compressImageToLimit } from "./js/image-compress.js?v=20261031-compress";
import {
    deleteUser,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { get, ref, remove, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
    deleteObject,
    getDownloadURL,
    getStorage,
    ref as storageRef,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const PHOTO_TYPES = ["image/png", "image/jpeg", "image/gif"];
const RECENT_LOGIN_MS = 5 * 60 * 1000;

const $ = (id) => document.getElementById(id);
const page = $("acctPage");
const statusEl = $("acctStatus");
const photoEl = $("acctPhoto");
const photoInput = $("acctPhotoInput");
const photoRemove = $("acctPhotoRemove");
const nameForm = $("acctNameForm");
const firstInput = $("acctFirstName");
const lastInput = $("acctLastName");
const nameSave = $("acctNameSave");
const nameError = $("acctNameError");
const emailEl = $("acctEmail");
const emailVerified = $("acctEmailVerified");
const passwordBtn = $("acctPasswordBtn");
const passwordHint = $("acctPasswordHint");
const logoutBtn = $("acctLogoutBtn");
const deleteBtn = $("acctDeleteBtn");
const deleteDialog = $("acctDeleteDialog");
const deleteConfirm = $("acctDeleteConfirm");
const deleteConfirmBtn = $("acctDeleteConfirmBtn");
const deleteError = $("acctDeleteError");

const storage = getStorage(auth.app);
let currentUser = null;
let savedName = { first: "", last: "" };
let photoPath = "";

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
}

function showError(el, message) {
    el.textContent = message;
    el.hidden = !message;
}

function paintPhoto(url, name) {
    photoEl.textContent = "";
    if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => { photoEl.textContent = name.charAt(0).toUpperCase(); }, { once: true });
        photoEl.appendChild(img);
    } else {
        photoEl.textContent = name.charAt(0).toUpperCase();
    }
    photoRemove.disabled = !url;
}

function nameChanged() {
    return firstInput.value.trim() !== savedName.first || lastInput.value.trim() !== savedName.last;
}

function setBusy(button, busy, label) {
    button.disabled = busy;
    if (label) (button.querySelector("span") || button).textContent = label;
}

onAuthStateChanged(auth, async (user) => {
    const viewedUser = new URLSearchParams(location.search).get("uid");
    if (viewedUser && viewedUser !== user?.uid) {
        page.hidden = true;
        return;
    }
    if (!user) {
        window.location.replace("signup.html");
        return;
    }
    const usesPassword = user.providerData.some((p) => p.providerId === "password");
    if (usesPassword && !user.emailVerified) {
        window.location.replace("signup.html?verify=required");
        return;
    }
    currentUser = user;

    let profile = {};
    try {
        const snapshot = await get(ref(db, `users/${user.uid}`));
        if (snapshot.exists()) profile = snapshot.val() || {};
    } catch (error) {
        console.error("[Profile] Could not load profile:", error);
        setStatus("Your profile could not be loaded. Please refresh the page.", true);
    }

    savedName = {
        first: String(profile.first_name || profile.firstName || "").trim(),
        last: String(profile.last_name || profile.lastName || "").trim()
    };
    if (!savedName.first && user.displayName) {
        const [first, ...rest] = user.displayName.trim().split(/\s+/);
        savedName = { first: first || "", last: rest.join(" ") };
    }
    firstInput.value = savedName.first;
    lastInput.value = savedName.last;
    photoPath = profile.photoPath || "";

    paintPhoto(user.photoURL || profile.photoURL || "", resolveDisplayName(user, profile));
    emailEl.textContent = user.email || "No email on file";
    emailVerified.hidden = !user.emailVerified;

    if (!usesPassword) {
        passwordBtn.hidden = true;
        passwordHint.textContent = "You sign in with Google, so there is no password to change.";
    }
    page.setAttribute("aria-busy", "false");
});

nameForm.addEventListener("input", () => {
    showError(nameError, "");
    firstInput.removeAttribute("aria-invalid");
    nameSave.disabled = !nameChanged();
});

nameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser || !nameChanged()) return;
    const first = firstInput.value.trim();
    const last = lastInput.value.trim();
    if (!first) {
        firstInput.setAttribute("aria-invalid", "true");
        showError(nameError, "Please enter your first name.");
        firstInput.focus();
        return;
    }
    setBusy(nameSave, true, "Saving...");
    try {
        await Promise.all([
            update(ref(db, `users/${currentUser.uid}`), { first_name: first, last_name: last }),
            updateProfile(currentUser, { displayName: `${first} ${last}`.trim() })
        ]);
        savedName = { first, last };
        if (!currentUser.photoURL) paintPhoto("", first);
        setStatus("Your name has been updated.");
    } catch (error) {
        console.error("[Profile] Could not save name:", error);
        showError(nameError, "We could not save your name. Please try again.");
    } finally {
        setBusy(nameSave, false, "Save changes");
        nameSave.disabled = !nameChanged();
    }
});

photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    photoInput.value = "";
    if (!file || !currentUser) return;
    if (!PHOTO_TYPES.includes(file.type)) {
        setStatus("Please choose a PNG, JPEG or GIF image.", true);
        return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
        setStatus("That image is too large to process. Please choose one under 40MB.", true);
        return;
    }
    photoRemove.disabled = true;
    try {
        let upload = { blob: file, type: file.type, compressed: false };
        if (file.size > MAX_PHOTO_BYTES) {
            setStatus("Compressing your photo...");
            upload = await compressImageToLimit(file, MAX_PHOTO_BYTES);
        }
        setStatus("Uploading your photo...");
        const ext = upload.type === "image/png" ? "png" : upload.type === "image/gif" ? "gif" : "jpg";
        const path = `profiles/${currentUser.uid}/avatar.${ext}`;
        const objectRef = storageRef(storage, path);
        await uploadBytes(objectRef, upload.blob, { contentType: upload.type });
        const url = await getDownloadURL(objectRef);
        if (photoPath && photoPath !== path) {
            await deleteObject(storageRef(storage, photoPath)).catch(() => {});
        }
        await Promise.all([
            updateProfile(currentUser, { photoURL: url }),
            update(ref(db, `users/${currentUser.uid}`), { photoURL: url, photoPath: path })
        ]);
        photoPath = path;
        paintPhoto(url, resolveDisplayName(currentUser, { first_name: savedName.first }));
        setStatus(upload.compressed
            ? `Your profile photo has been updated (compressed to ${(upload.blob.size / 1024 / 1024).toFixed(1)}MB).`
            : "Your profile photo has been updated.");
    } catch (error) {
        console.error("[Profile] Could not upload photo:", error);
        const message = error?.message === "image-too-large" || error?.message === "image-decode-failed"
            ? "We could not compress that image. Please try a different photo."
            : "We could not upload that photo. Please try again.";
        setStatus(message, true);
        photoRemove.disabled = !currentUser.photoURL;
    }
});

photoRemove.addEventListener("click", async () => {
    if (!currentUser) return;
    photoRemove.disabled = true;
    setStatus("Removing your photo...");
    try {
        if (photoPath) await deleteObject(storageRef(storage, photoPath)).catch(() => {});
        await Promise.all([
            updateProfile(currentUser, { photoURL: null }),
            update(ref(db, `users/${currentUser.uid}`), { photoURL: null, photoPath: null })
        ]);
        photoPath = "";
        paintPhoto("", resolveDisplayName(currentUser, { first_name: savedName.first }));
        setStatus("Your profile photo has been removed.");
    } catch (error) {
        console.error("[Profile] Could not remove photo:", error);
        setStatus("We could not remove your photo. Please try again.", true);
        photoRemove.disabled = false;
    }
});

passwordBtn.addEventListener("click", async () => {
    if (!currentUser?.email) return;
    setBusy(passwordBtn, true, "Sending...");
    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        setStatus(`We sent a password reset link to ${currentUser.email}.`);
    } catch (error) {
        console.error("[Profile] Could not send reset email:", error);
        setStatus("We could not send the reset email. Please try again later.", true);
    } finally {
        setBusy(passwordBtn, false, "Change password");
    }
});

logoutBtn.addEventListener("click", () => {
    logoutBtn.disabled = true;
    signOutAndRedirect();
});

deleteBtn.addEventListener("click", () => {
    deleteConfirm.value = "";
    deleteConfirmBtn.disabled = true;
    showError(deleteError, "");
    deleteDialog.showModal();
    deleteConfirm.focus();
});

deleteConfirm.addEventListener("input", () => {
    deleteConfirmBtn.disabled = deleteConfirm.value.trim() !== "DELETE";
});

deleteConfirmBtn.addEventListener("click", async () => {
    if (!currentUser) return;
    const lastSignIn = Date.parse(currentUser.metadata.lastSignInTime || "");
    if (!lastSignIn || Date.now() - lastSignIn > RECENT_LOGIN_MS) {
        showError(deleteError, "For your security, please log out and sign in again, then delete your account within 5 minutes.");
        return;
    }
    deleteConfirmBtn.disabled = true;
    deleteConfirmBtn.textContent = "Deleting...";
    try {
        const uid = currentUser.uid;
        if (photoPath) await deleteObject(storageRef(storage, photoPath)).catch(() => {});
        await remove(ref(db, `users/${uid}`));
        await remove(ref(db, `community_profiles/${uid}`));
        await deleteUser(currentUser);
        signOutAndRedirect();
    } catch (error) {
        console.error("[Profile] Could not delete account:", error);
        const message = error?.code === "auth/requires-recent-login"
            ? "For your security, please log out and sign in again, then try deleting your account."
            : "We could not delete your account. Please contact support.";
        showError(deleteError, message);
        deleteConfirmBtn.textContent = "Delete account";
        deleteConfirmBtn.disabled = false;
    }
});
