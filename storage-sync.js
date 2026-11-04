/*
 * Shared storage helper using Firebase Realtime Database + localStorage fallback.
 * This allows question sets to sync across different laptops and networks.
 */

const FIREBASE_RTDB_BASE_URL = "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";
const RTDB_PROBLEMS_PATH = "ielts_check/problems_v1";

class StorageSync {
  constructor() {
    this.isRemoteAvailable = true;
    this._lastStorageError = "";
    this._problemsRevision = null;
  }

  _coerceModuleList(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];

    // RTDB may return arrays as plain objects with numeric keys.
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .filter((item) => item && typeof item === "object");
  }

  _buildRtdbUrl(path) {
    return `${FIREBASE_RTDB_BASE_URL}/${path}.json`;
  }

  async _rtdbGet(path) {
    const response = await fetch(this._buildRtdbUrl(path), {
      method: "GET",
      headers: { "Content-Type": "application/json", "X-Firebase-ETag": "true" }
    });
    if (!response.ok) {
      throw new Error(`RTDB GET failed (${response.status})`);
    }
    const data = await response.json();
    const revision = response.headers.get("ETag");
    if (!revision) throw new Error("RTDB did not provide a revision; reload before saving.");
    return { data, revision };
  }

  async _rtdbPut(path, data, revision) {
    if (!revision) throw new Error("Reload the shared problem list before saving.");
    const response = await fetch(this._buildRtdbUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "If-Match": revision },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      if (response.status === 412) {
        const error = new Error("Another editor changed these problems. Reload before saving again.");
        error.code = "STORAGE_CONFLICT";
        throw error;
      }
      throw new Error(`RTDB PUT failed (${response.status})`);
    }
    return response.json();
  }

  _normalizeProblems(problems) {
    const source = problems && typeof problems === "object" ? problems : {};
    return {
      reading: this._coerceModuleList(source.reading),
      listening: this._coerceModuleList(source.listening),
      writing: this._coerceModuleList(source.writing),
      speaking: this._coerceModuleList(source.speaking)
    };
  }

  async getAllProblems() {
    try {
      const { data, revision } = await this._rtdbGet(RTDB_PROBLEMS_PATH);
      const normalized = this._normalizeProblems(data || {});
      this._problemsRevision = revision;
      this._saveProblemsToLocalStorage(normalized);
      this.isRemoteAvailable = true;
      this._lastStorageError = "";
      return normalized;
    } catch (error) {
      this.isRemoteAvailable = false;
      this._problemsRevision = null;
      this._lastStorageError = error.message;
      console.warn("RTDB read failed, using localStorage fallback:", error.message);
    }

    return this._getProblemsFromLocalStorage();
  }

  async getProblemsByModule(module) {
    const all = await this.getAllProblems();
    return Array.isArray(all[module]) ? all[module] : [];
  }

  async saveAllProblems(problems) {
    const normalized = this._normalizeProblems(problems);

    try {
      await this._rtdbPut(RTDB_PROBLEMS_PATH, {
        ...normalized,
        updatedAt: new Date().toISOString()
      }, this._problemsRevision);
      this._problemsRevision = null;
      this.isRemoteAvailable = true;
      this._lastStorageError = "";
    } catch (error) {
      this.isRemoteAvailable = false;
      this._lastStorageError = error.message;
      console.warn("Shared problems were not saved:", error.message);
      throw error;
    }

    this._saveProblemsToLocalStorage(normalized);
    return true;
  }

  async saveProblemsByModule(module, list) {
    this._validateModule(module);
    const all = this._getProblemsFromLocalStorage();
    const normalized = this._normalizeProblems(all);
    normalized[module] = Array.isArray(list) ? list : [];
    return this.saveAllProblems(normalized);
  }

  async addProblem(module, problemData) {
    const item = { ...problemData };
    if (!item.id) {
      item.id = `problem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    await this._mutateProblems(module, (list) => {
      if (!list.some((problem) => problem.id === item.id)) list.unshift(item);
      return list;
    });
    return item;
  }

  async deleteProblem(module, problemId) {
    await this._mutateProblems(module, (list) => list.filter((p) => p.id !== problemId));
    return true;
  }

  async updateProblem(module, problemId, updatedData) {
    let original = this._getProblemsFromLocalStorage()[module]?.find((p) => p.id === problemId);
    await this._mutateProblems(module, (list) => {
      const index = list.findIndex((p) => p.id === problemId);
      if (index === -1) throw new Error("Problem no longer exists. Reload the list.");
      if (original && JSON.stringify(original) !== JSON.stringify(list[index])) {
        throw new Error("Another editor changed this problem. Reload before saving.");
      }
      if (!original) original = list[index];
      list[index] = { ...updatedData, id: problemId };
      return list;
    });
    return true;
  }

  _validateModule(module) {
    if (!["reading", "listening", "writing", "speaking"].includes(module)) {
      throw new Error(`Unsupported problem module: ${module}`);
    }
  }

  async _mutateProblems(module, mutate) {
    this._validateModule(module);
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, revision } = await this._rtdbGet(RTDB_PROBLEMS_PATH);
        const normalized = this._normalizeProblems(data);
        normalized[module] = mutate(normalized[module]);
        try {
          await this._rtdbPut(RTDB_PROBLEMS_PATH, {
            ...normalized, updatedAt: new Date().toISOString()
          }, revision);
        } catch (error) {
          if (error.code === "STORAGE_CONFLICT" && attempt < 4) continue;
          throw error;
        }
        this._saveProblemsToLocalStorage(normalized);
        this._problemsRevision = null;
        this.isRemoteAvailable = true;
        this._lastStorageError = "";
        return true;
      }
    } catch (error) {
      this.isRemoteAvailable = false;
      this._lastStorageError = error.message;
      console.warn("Shared problem change was not saved:", error.message);
      throw error;
    }
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
