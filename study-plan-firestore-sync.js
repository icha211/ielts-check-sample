(function attachStudyPlanFirestoreSync(global) {
  const DEFAULT_PROJECT_ID = "quickcheck-25590";
  const DEFAULT_POLL_INTERVAL = 8000;
  const UID_STORAGE_KEYS = [
    "quickcheck_uid",
    "user_uid",
    "auth_uid",
    "current_uid",
    "uid"
  ];
  const TOKEN_STORAGE_KEYS = [
    "firebase_id_token",
    "auth_id_token",
    "quickcheck_id_token",
    "idToken"
  ];

  function safeParse(raw, fallback) {
    try {
      return JSON.parse(raw) || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function safeStringify(value, fallback) {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return fallback;
    }
  }

  function detectUid(explicitUid) {
    if (explicitUid) return String(explicitUid);
    if (global.currentUser && global.currentUser.uid) {
      return String(global.currentUser.uid);
    }
    for (const key of UID_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return String(value);
    }
    return "guest-toefl-user";
  }

  function detectIdToken() {
    for (const key of TOKEN_STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return String(value);
    }
    return "";
  }

  function toFirestoreValue(value) {
    if (value === null || value === undefined) return { nullValue: null };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
    const valueType = typeof value;
    if (valueType === "string") return { stringValue: value };
    if (valueType === "boolean") return { booleanValue: value };
    if (valueType === "number") {
      if (Number.isInteger(value)) return { integerValue: String(value) };
      return { doubleValue: value };
    }
    if (valueType === "object") {
      const fields = {};
      Object.entries(value).forEach(([key, item]) => {
        if (item === undefined) return;
        fields[key] = toFirestoreValue(item);
      });
      return { mapValue: { fields } };
    }
    return { stringValue: String(value) };
  }

  function fromFirestoreValue(value) {
    if (!value || typeof value !== "object") return null;
    if ("stringValue" in value) return value.stringValue;
    if ("booleanValue" in value) return Boolean(value.booleanValue);
    if ("integerValue" in value) return Number(value.integerValue);
    if ("doubleValue" in value) return Number(value.doubleValue);
    if ("nullValue" in value) return null;
    if ("arrayValue" in value) {
      return (value.arrayValue.values || []).map(fromFirestoreValue);
    }
    if ("mapValue" in value) {
      const fields = (value.mapValue && value.mapValue.fields) || {};
      const output = {};
      Object.entries(fields).forEach(([key, item]) => {
        output[key] = fromFirestoreValue(item);
      });
      return output;
    }
    return null;
  }

  function decodeDocument(doc) {
    const fields = doc && doc.fields ? doc.fields : {};
    const output = {};
    Object.entries(fields).forEach(([key, value]) => {
      output[key] = fromFirestoreValue(value);
    });
    return output;
  }

  class StudyPlanFirestoreSync {
    constructor(options) {
      const config = options || {};
      this.projectId = String(config.projectId || DEFAULT_PROJECT_ID);
      this.uid = detectUid(config.uid);
      this.pollIntervalMs = Number(config.pollIntervalMs) || DEFAULT_POLL_INTERVAL;
      this.planCacheKey = `studyPlans_${this.uid}_plan_cache_v1`;
      this.dailyCacheKey = `studyPlans_${this.uid}_dailyTasks_cache_v1`;
      this.plan = safeParse(localStorage.getItem(this.planCacheKey), {});
      this.dailyTasks = safeParse(localStorage.getItem(this.dailyCacheKey), {});
      this.subscribers = new Set();
      this.timer = null;
      this.lastError = "";
      this.isCloudActive = false;
    }

    _headers() {
      const headers = { "Content-Type": "application/json" };
      const token = detectIdToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    }

    _docUrl(path) {
      return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${path}`;
    }

    _basePath() {
      return `studyPlans/${encodeURIComponent(this.uid)}`;
    }

    _dailyTasksPath() {
      return `${this._basePath()}/dailyTasks`;
    }

    _persistLocal() {
      localStorage.setItem(this.planCacheKey, safeStringify(this.plan, "{}"));
      localStorage.setItem(this.dailyCacheKey, safeStringify(this.dailyTasks, "{}"));
    }

    _notify() {
      const snapshot = {
        uid: this.uid,
        plan: { ...(this.plan || {}) },
        dailyTasks: { ...(this.dailyTasks || {}) },
        isCloudActive: this.isCloudActive,
        lastError: this.lastError
      };
      this.subscribers.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (error) {
          console.warn("[StudyPlanSync] subscriber failed:", error);
        }
      });
    }

    subscribe(listener) {
      if (typeof listener !== "function") return function noop() {};
      this.subscribers.add(listener);
      listener({
        uid: this.uid,
        plan: { ...(this.plan || {}) },
        dailyTasks: { ...(this.dailyTasks || {}) },
        isCloudActive: this.isCloudActive,
        lastError: this.lastError
      });
      return () => {
        this.subscribers.delete(listener);
      };
    }

    getDay(dateStr) {
      return this.dailyTasks[dateStr] || null;
    }

    listDaysForMonth(year, monthIndex) {
      const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
      const output = {};
      Object.entries(this.dailyTasks).forEach(([dateStr, value]) => {
        if (dateStr.startsWith(monthPrefix)) {
          output[dateStr] = value;
        }
      });
      return output;
    }

    async _getJson(url) {
      const response = await fetch(url, { method: "GET", headers: this._headers() });
      if (!response.ok) {
        throw new Error(`GET ${response.status}`);
      }
      return response.json();
    }

    async _patchDoc(path, payload) {
      const response = await fetch(this._docUrl(path), {
        method: "PATCH",
        headers: this._headers(),
        body: safeStringify({ fields: toFirestoreValue(payload).mapValue.fields }, "{}")
      });
      if (!response.ok) {
        throw new Error(`PATCH ${response.status}`);
      }
      return response.json();
    }

    async refresh() {
      try {
        const [planDoc, tasks] = await Promise.all([
          this._getJson(this._docUrl(this._basePath())),
          this._getJson(this._docUrl(this._dailyTasksPath()))
        ]);
        this.plan = decodeDocument(planDoc);
        const docs = Array.isArray(tasks.documents) ? tasks.documents : [];
        const dailyMap = {};
        docs.forEach((doc) => {
          const decoded = decodeDocument(doc);
          const dateStr = decoded.dateStr || String(doc.name || "").split("/").pop();
          if (!dateStr) return;
          dailyMap[dateStr] = decoded;
        });
        this.dailyTasks = dailyMap;
        this.isCloudActive = true;
        this.lastError = "";
        this._persistLocal();
      } catch (error) {
        this.isCloudActive = false;
        this.lastError = String(error && error.message ? error.message : error);
      }
      this._notify();
    }

    start() {
      this.stop();
      this.refresh();
      this.timer = setInterval(() => {
        this.refresh();
      }, this.pollIntervalMs);
    }

    stop() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }

    async savePlan(partialPayload) {
      const payload = {
        ...(this.plan || {}),
        ...(partialPayload || {}),
        uid: this.uid,
        updatedAt: new Date().toISOString()
      };
      this.plan = payload;
      this._persistLocal();
      this._notify();
      try {
        await this._patchDoc(this._basePath(), payload);
        this.isCloudActive = true;
        this.lastError = "";
      } catch (error) {
        this.isCloudActive = false;
        this.lastError = String(error && error.message ? error.message : error);
      }
      this._notify();
    }

    async saveDay(dateStr, dayPayload) {
      if (!dateStr) return;
      const payload = {
        ...(dayPayload || {}),
        dateStr,
        updatedAt: new Date().toISOString()
      };
      this.dailyTasks[dateStr] = payload;
      this._persistLocal();
      this._notify();
      try {
        await this._patchDoc(`${this._dailyTasksPath()}/${encodeURIComponent(dateStr)}`, payload);
        this.isCloudActive = true;
        this.lastError = "";
      } catch (error) {
        this.isCloudActive = false;
        this.lastError = String(error && error.message ? error.message : error);
      }
      this._notify();
    }
  }

  global.StudyPlanFirestoreSync = StudyPlanFirestoreSync;
})(window);
