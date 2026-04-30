/*
 * Shared storage helper using Firebase Realtime Database + localStorage fallback.
 * This allows question sets to sync across different laptops and networks.
 */

const FIREBASE_RTDB_BASE_URL = "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";
const RTDB_PROBLEMS_PATH = "ielts_check/problems_v1";

class StorageSync {
  constructor() {
    this.isRemoteAvailable = true;
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
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) {
      throw new Error(`RTDB GET failed (${response.status})`);
    }
    return response.json();
  }

  async _rtdbPut(path, data) {
    const response = await fetch(this._buildRtdbUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
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
    if (this.isRemoteAvailable) {
      try {
        const data = await this._rtdbGet(RTDB_PROBLEMS_PATH);
        const normalized = this._normalizeProblems(data || {});
        this._saveProblemsToLocalStorage(normalized);
        return normalized;
      } catch (error) {
        this.isRemoteAvailable = false;
        console.warn("RTDB read failed, using localStorage fallback:", error.message);
      }
    }

    return this._getProblemsFromLocalStorage();
  }

  async getProblemsByModule(module) {
    const all = await this.getAllProblems();
    return Array.isArray(all[module]) ? all[module] : [];
  }

  async saveAllProblems(problems) {
    const normalized = this._normalizeProblems(problems);

    if (this.isRemoteAvailable) {
      try {
        await this._rtdbPut(RTDB_PROBLEMS_PATH, {
          ...normalized,
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        this.isRemoteAvailable = false;
        console.warn("RTDB write failed, using localStorage fallback:", error.message);
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
