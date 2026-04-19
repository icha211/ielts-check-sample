/*
 * Shared storage helper using Firebase Firestore + localStorage fallback.
 * This allows question sets to sync across different laptops and networks.
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBtaZOok-Kj91qzCo_6ClCZ8Lfgam7qRxg",
  authDomain: "quickcheck-25590.firebaseapp.com",
  projectId: "quickcheck-25590",
  storageBucket: "quickcheck-25590.firebasestorage.app",
  messagingSenderId: "753959270698",
  appId: "1:753959270698:web:ec1415910d1d52a7958653",
  measurementId: "G-MQX3QELGJL"
};

const FIRESTORE_COLLECTION = "ielts_check";
const FIRESTORE_DOC = "problems_v1";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

class StorageSync {
  constructor() {
    this.db = null;
    this.isFirebaseAvailable = false;
    this.initPromise = this.initializeFirebase();
  }

  async initializeFirebase() {
    try {
      if (!window.firebase) {
        await loadScript("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
        await loadScript("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js");
      }

      if (!window.firebase) {
        throw new Error("Firebase SDK unavailable");
      }

      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }

      this.db = firebase.firestore();
      this.isFirebaseAvailable = true;

      // Ensure the shared document exists.
      await this.db
        .collection(FIRESTORE_COLLECTION)
        .doc(FIRESTORE_DOC)
        .set(this._normalizeProblems({}), { merge: true });
    } catch (error) {
      this.isFirebaseAvailable = false;
      console.warn("Firebase unavailable, using localStorage fallback:", error.message);
    }
  }

  async awaitReady() {
    try {
      await this.initPromise;
    } catch (error) {
      // Ignore and continue with fallback.
    }
  }

  _normalizeProblems(problems) {
    const source = problems && typeof problems === "object" ? problems : {};
    return {
      reading: Array.isArray(source.reading) ? source.reading : [],
      listening: Array.isArray(source.listening) ? source.listening : [],
      writing: Array.isArray(source.writing) ? source.writing : [],
      speaking: Array.isArray(source.speaking) ? source.speaking : []
    };
  }

  async getAllProblems() {
    await this.awaitReady();

    if (this.isFirebaseAvailable && this.db) {
      try {
        const doc = await this.db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).get();
        const normalized = this._normalizeProblems(doc.exists ? doc.data() : {});
        this._saveProblemsToLocalStorage(normalized);
        return normalized;
      } catch (error) {
        console.error("Error fetching from Firebase:", error);
      }
    }

    return this._getProblemsFromLocalStorage();
  }

  async getProblemsByModule(module) {
    const all = await this.getAllProblems();
    return Array.isArray(all[module]) ? all[module] : [];
  }

  async saveAllProblems(problems) {
    await this.awaitReady();
    const normalized = this._normalizeProblems(problems);

    if (this.isFirebaseAvailable && this.db) {
      try {
        await this.db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC).set(
          {
            ...normalized,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Error saving to Firebase:", error);
      }
    }

    this._saveProblemsToLocalStorage(normalized);
    return true;
  }

  async saveProblemsByModule(module, list) {
    const all = await this.getAllProblems();
    const normalized = this._normalizeProblems(all);
    normalized[module] = Array.isArray(list) ? list : [];
    return this.saveAllProblems(normalized);
  }

  async addProblem(module, problemData) {
    const list = await this.getProblemsByModule(module);
    const item = { ...problemData };
    if (!item.id) {
      item.id = `problem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    list.unshift(item);
    await this.saveProblemsByModule(module, list);
    return item;
  }

  async deleteProblem(module, problemId) {
    const list = await this.getProblemsByModule(module);
    const filtered = list.filter((p) => p.id !== problemId);
    await this.saveProblemsByModule(module, filtered);
    return true;
  }

  async updateProblem(module, problemId, updatedData) {
    const list = await this.getProblemsByModule(module);
    const index = list.findIndex((p) => p.id === problemId);
    if (index === -1) return false;
    list[index] = updatedData;
    await this.saveProblemsByModule(module, list);
    return true;
  }

  async recordDailyTest(module, date, completed = true) {
    const key = "prephaven_daily_tests_v1";
    const raw = localStorage.getItem(key);
    const data = raw ? JSON.parse(raw) : {};
    if (!data[date]) data[date] = {};
    data[date][module] = Boolean(completed);
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  }

  async saveTestResult(resultData) {
    const key = "prephaven_test_results_v1";
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({ ...resultData, timestamp: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  }

  _getProblemsFromLocalStorage() {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1"
    };

    const problems = {};
    for (const [module, key] of Object.entries(keys)) {
      try {
        const raw = localStorage.getItem(key);
        problems[module] = raw ? JSON.parse(raw) : [];
      } catch (error) {
        problems[module] = [];
      }
    }
    return this._normalizeProblems(problems);
  }

  _saveProblemsToLocalStorage(problems) {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1"
    };

    const normalized = this._normalizeProblems(problems);
    for (const [module, key] of Object.entries(keys)) {
      localStorage.setItem(key, JSON.stringify(normalized[module]));
    }
  }
}

const storageSync = new StorageSync();
