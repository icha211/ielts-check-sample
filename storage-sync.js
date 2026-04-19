/**
 * Storage Sync Helper - Synchronizes data between browser localStorage and persistent backend storage
 * Provides automatic caching and fallback to localStorage if server is unavailable
 */

const STORAGE_SERVER_URL = "http://127.0.0.1:8788/api";
const SYNC_TIMEOUT = 3000; // 3 seconds

class StorageSync {
  constructor() {
    this.isServerAvailable = null;
    this.checkServerAvailability();
  }

  /**
   * Check if storage server is available
   */
  async checkServerAvailability() {
    try {
      const response = await Promise.race([
        fetch(`${STORAGE_SERVER_URL}/problems`),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), SYNC_TIMEOUT)
        ),
      ]);
      this.isServerAvailable = response.ok;
    } catch (e) {
      this.isServerAvailable = false;
      console.warn(
        "⚠️  Storage server unavailable. Using browser localStorage as fallback."
      );
    }
  }

  /**
   * Get all problems from server or localStorage
   */
  async getAllProblems() {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/problems`);
        if (response.ok) {
          return await response.json();
        }
      } catch (e) {
        console.error("Error fetching problems from server:", e);
      }
    }

    // Fallback to localStorage
    return this._getProblemsFromLocalStorage();
  }

  /**
   * Get problems for a specific module
   */
  async getProblemsByModule(module) {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(
          `${STORAGE_SERVER_URL}/problems/${module}`
        );
        if (response.ok) {
          return await response.json();
        }
      } catch (e) {
        console.error(
          `Error fetching ${module} problems from server:`,
          e
        );
      }
    }

    // Fallback to localStorage
    const problems = this._getProblemsFromLocalStorage();
    return problems[module] || [];
  }

  /**
   * Save all problems to server and localStorage
   */
  async saveAllProblems(problems) {
    let serverSuccess = false;

    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/problems`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-all-problems",
            problems,
          }),
        });
        serverSuccess = response.ok;
      } catch (e) {
        console.error("Error saving problems to server:", e);
      }
    }

    // Always save to localStorage as backup
    this._saveProblemsToLocalStorage(problems);

    return serverSuccess;
  }

  /**
   * Add a single problem
   */
  async addProblem(module, problemData) {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/problems`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-problem",
            module,
            problem: problemData,
          }),
        });
        if (response.ok) {
          const result = await response.json();
          // Also update localStorage
          await this._addToLocalStorage(module, result.problem);
          return result.problem;
        }
      } catch (e) {
        console.error("Error adding problem to server:", e);
      }
    }

    // Fallback: save locally
    return await this._addToLocalStorage(module, problemData);
  }

  /**
   * Delete a problem
   */
  async deleteProblem(module, problemId) {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/problems`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module,
            id: problemId,
          }),
        });
        if (response.ok) {
          // Also delete from localStorage
          await this._deleteFromLocalStorage(module, problemId);
          return true;
        }
      } catch (e) {
        console.error("Error deleting problem from server:", e);
      }
    }

    // Fallback: delete locally
    return await this._deleteFromLocalStorage(module, problemId);
  }

  /**
   * Update a problem
   */
  async updateProblem(module, problemId, updatedData) {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/problems`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            module,
            id: problemId,
            data: updatedData,
          }),
        });
        if (response.ok) {
          // Also update in localStorage
          await this._updateInLocalStorage(module, problemId, updatedData);
          return true;
        }
      } catch (e) {
        console.error("Error updating problem on server:", e);
      }
    }

    // Fallback: update locally
    return await this._updateInLocalStorage(module, problemId, updatedData);
  }

  /**
   * Record daily test completion
   */
  async recordDailyTest(module, date, completed = true) {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/daily-tests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "record-daily-test",
            module,
            date,
            completed,
          }),
        });
        return response.ok;
      } catch (e) {
        console.error("Error recording daily test on server:", e);
      }
    }

    // Fallback: would need to implement localStorage version if needed
    return false;
  }

  /**
   * Save test result
   */
  async saveTestResult(resultData) {
    if (this.isServerAvailable) {
      try {
        const response = await fetch(`${STORAGE_SERVER_URL}/test-results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save-test-result",
            result: resultData,
          }),
        });
        return response.ok;
      } catch (e) {
        console.error("Error saving test result to server:", e);
      }
    }

    return false;
  }

  // ============ LocalStorage Helper Methods ============

  _getProblemsFromLocalStorage() {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1",
    };

    const problems = {};
    for (const [module, key] of Object.entries(keys)) {
      const raw = localStorage.getItem(key);
      problems[module] = raw ? JSON.parse(raw) : [];
    }
    return problems;
  }

  _saveProblemsToLocalStorage(problems) {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1",
    };

    for (const [module, key] of Object.entries(keys)) {
      if (problems[module]) {
        localStorage.setItem(key, JSON.stringify(problems[module]));
      }
    }
  }

  async _addToLocalStorage(module, problemData) {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1",
    };

    const key = keys[module];
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];

    if (!problemData.id) {
      problemData.id = list.length + 1;
    }

    list.push(problemData);
    localStorage.setItem(key, JSON.stringify(list));
    return problemData;
  }

  async _deleteFromLocalStorage(module, problemId) {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1",
    };

    const key = keys[module];
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((p) => p.id !== problemId);
    localStorage.setItem(key, JSON.stringify(filtered));
    return true;
  }

  async _updateInLocalStorage(module, problemId, updatedData) {
    const keys = {
      reading: "prephaven_problems_v1",
      listening: "prephaven_problems_listening_v1",
      writing: "prephaven_problems_writing_v1",
      speaking: "prephaven_problems_speaking_v1",
    };

    const key = keys[module];
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];

    const index = list.findIndex((p) => p.id === problemId);
    if (index !== -1) {
      list[index] = updatedData;
      localStorage.setItem(key, JSON.stringify(list));
    }

    return index !== -1;
  }
}

// Create global instance
const storageSync = new StorageSync();
