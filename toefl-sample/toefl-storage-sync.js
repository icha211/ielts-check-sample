/*
 * TOEFL ITP Shared Storage Sync
 * Uses Firebase Realtime Database so all developers on any device/network
 * can read, write, and edit the same section content and metadata.
 * Falls back gracefully to localStorage when offline.
 *
 * Firebase path layout:
 *   toefl_itp/sets_v2/{setId}   → section metadata per created set
 *   toefl_itp/drafts_v2/{setId} → full draft content per created set
 *
 * Legacy compatibility (older pages/data):
 *   toefl_itp/sets_v1
 *   toefl_itp/drafts_v1/{module}
 */

const TOEFL_FIREBASE_URL = "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";

class ToeflStorageSync {
  constructor() {
    this._base = TOEFL_FIREBASE_URL;
    this._setsV2Path = "toefl_itp/sets_v2";
    this._draftsV2Path = "toefl_itp/drafts_v2";
    this._setsPath = "toefl_itp/sets_v1";
    this._draftsPath = "toefl_itp/drafts_v1";
    this.isRemoteAvailable = true;
    // localStorage fallback keys
    this._setsV2LocalKey = "toefl_developer_sets_v2";
    this._draftsV2LocalKey = "toefl_developer_drafts_v2";
    this._setsLocalKey = "toefl_developer_sets_v1";
  }

  _url(path) {
    return `${this._base}/${path}.json`;
  }

  async _get(path) {
    const r = await fetch(this._url(path), { method: "GET" });
    if (!r.ok) throw new Error(`Firebase GET failed (${r.status})`);
    return r.json();
  }

  async _put(path, data) {
    const r = await fetch(this._url(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(`Firebase PUT failed (${r.status})`);
    return r.json();
  }

  _safeParse(raw, fallback) {
    try { return JSON.parse(raw) || fallback; } catch { return fallback; }
  }

  createSetId(module, setDate) {
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(setDate || ""))
      ? String(setDate)
      : new Date().toISOString().split("T")[0];
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `${module}_${normalizedDate}_${stamp}_${rand}`;
  }

  _normalizeRecord(item, fallbackSetId) {
    if (!item || typeof item !== "object") return null;
    const moduleId = String(item.module || "");
    if (!moduleId) return null;
    const setDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.setDate || item.date || ""))
      ? String(item.setDate || item.date)
      : "";
    const setId = String(item.setId || fallbackSetId || "");
    if (!setId) return null;
    return {
      setId,
      module: moduleId,
      label: String(item.label || ""),
      setDate,
      difficulty: String(item.difficulty || "intermediate"),
      updatedAt: String(item.updatedAt || item._updatedAt || "")
    };
  }

  _recordsToMap(records) {
    const map = {};
    (records || []).forEach((item) => {
      if (!item || !item.setId) return;
      map[item.setId] = item;
    });
    return map;
  }

  _legacyMapToRecords(rawMap) {
    const map = rawMap && typeof rawMap === "object" ? rawMap : {};
    return Object.entries(map)
      .filter(([key]) => key !== "_updatedAt")
      .map(([moduleOrId, value]) => {
        const moduleId = String(value?.module || moduleOrId || "");
        const setDate = String(value?.setDate || "");
        const fallbackId = this.createSetId(moduleId, setDate || undefined);
        return this._normalizeRecord({ ...value, module: moduleId, setId: fallbackId }, fallbackId);
      })
      .filter(Boolean);
  }

  // ─── SETS V2 (multi set records) ───────────────────────────────────────────

  async getSetRecords() {
    try {
      const v2 = await this._get(this._setsV2Path);
      const v2Map = (v2 && typeof v2 === "object" && !Array.isArray(v2)) ? v2 : {};
      const records = Object.entries(v2Map)
        .filter(([key]) => key !== "_updatedAt")
        .map(([setId, value]) => this._normalizeRecord({ ...value, setId }, setId))
        .filter(Boolean);
      if (records.length > 0) {
        localStorage.setItem(this._setsV2LocalKey, JSON.stringify(this._recordsToMap(records)));
        this.isRemoteAvailable = true;
        return records;
      }

      const legacy = await this._get(this._setsPath);
      const migrated = this._legacyMapToRecords(legacy);
      localStorage.setItem(this._setsV2LocalKey, JSON.stringify(this._recordsToMap(migrated)));
      this.isRemoteAvailable = true;
      return migrated;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn("[ToeflSync] Offline – using localStorage for set records:", e.message);
    }

    const localV2 = this._safeParse(localStorage.getItem(this._setsV2LocalKey), {});
    const localRecords = Object.entries(localV2 || {})
      .map(([setId, value]) => this._normalizeRecord({ ...value, setId }, setId))
      .filter(Boolean);
    if (localRecords.length > 0) return localRecords;

    const localLegacy = this._safeParse(localStorage.getItem(this._setsLocalKey), {});
    return this._legacyMapToRecords(localLegacy);
  }

  async getSetRecordById(setId) {
    if (!setId) return null;
    try {
      const data = await this._get(`${this._setsV2Path}/${setId}`);
      const normalized = this._normalizeRecord({ ...data, setId }, setId);
      if (normalized) {
        const local = this._safeParse(localStorage.getItem(this._setsV2LocalKey), {});
        local[setId] = normalized;
        localStorage.setItem(this._setsV2LocalKey, JSON.stringify(local));
      }
      this.isRemoteAvailable = true;
      return normalized;
    } catch {
      this.isRemoteAvailable = false;
    }
    const local = this._safeParse(localStorage.getItem(this._setsV2LocalKey), {});
    return this._normalizeRecord({ ...(local[setId] || {}), setId }, setId);
  }

  async upsertSetRecord(record) {
    const normalized = this._normalizeRecord(record, record?.setId);
    if (!normalized) throw new Error("Invalid set record");
    const payload = { ...normalized, _updatedAt: new Date().toISOString() };
    try {
      await this._put(`${this._setsV2Path}/${normalized.setId}`, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – ${normalized.setId} set saved locally only:`, e.message);
    }
    const local = this._safeParse(localStorage.getItem(this._setsV2LocalKey), {});
    local[normalized.setId] = normalized;
    localStorage.setItem(this._setsV2LocalKey, JSON.stringify(local));
    return normalized;
  }

  async saveSetRecords(records) {
    const normalized = (records || [])
      .map((item) => this._normalizeRecord(item, item?.setId))
      .filter(Boolean);
    const map = this._recordsToMap(normalized);
    const payload = { ...map, _updatedAt: new Date().toISOString() };
    try {
      await this._put(this._setsV2Path, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn("[ToeflSync] Offline – set records saved locally only:", e.message);
    }
    localStorage.setItem(this._setsV2LocalKey, JSON.stringify(map));
  }

  async deleteSetRecord(setId) {
    if (!setId) return;
    try {
      await fetch(this._url(`${this._setsV2Path}/${setId}`), { method: "DELETE" });
      await fetch(this._url(`${this._draftsV2Path}/${setId}`), { method: "DELETE" });
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – ${setId} delete queued locally only:`, e.message);
    }
    const localSets = this._safeParse(localStorage.getItem(this._setsV2LocalKey), {});
    delete localSets[setId];
    localStorage.setItem(this._setsV2LocalKey, JSON.stringify(localSets));
    const localDrafts = this._safeParse(localStorage.getItem(this._draftsV2LocalKey), {});
    delete localDrafts[setId];
    localStorage.setItem(this._draftsV2LocalKey, JSON.stringify(localDrafts));
  }

  async getDraftBySetId(setId) {
    if (!setId) return {};
    try {
      const data = await this._get(`${this._draftsV2Path}/${setId}`);
      const draft = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
      const local = this._safeParse(localStorage.getItem(this._draftsV2LocalKey), {});
      local[setId] = draft;
      localStorage.setItem(this._draftsV2LocalKey, JSON.stringify(local));
      this.isRemoteAvailable = true;
      return draft;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – using localStorage for set draft ${setId}:`, e.message);
    }
    const local = this._safeParse(localStorage.getItem(this._draftsV2LocalKey), {});
    return local[setId] || {};
  }

  async saveDraftBySetId(setId, module, draft) {
    if (!setId) throw new Error("setId is required");
    const payload = {
      ...(draft || {}),
      setId,
      module: String(module || draft?.module || ""),
      _updatedAt: new Date().toISOString()
    };
    try {
      await this._put(`${this._draftsV2Path}/${setId}`, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – set draft ${setId} saved locally only:`, e.message);
    }
    const local = this._safeParse(localStorage.getItem(this._draftsV2LocalKey), {});
    local[setId] = draft || {};
    localStorage.setItem(this._draftsV2LocalKey, JSON.stringify(local));
  }

  // ─── SETS (section metadata: date, difficulty) ────────────────────────────

  /** Fetch sets map from Firebase; falls back to localStorage. */
  async getSetsMap() {
    try {
      const data = await this._get(this._setsPath);
      const map = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
      localStorage.setItem(this._setsLocalKey, JSON.stringify(map));
      this.isRemoteAvailable = true;
      return map;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn("[ToeflSync] Offline – using localStorage for sets:", e.message);
    }
    return this._safeParse(localStorage.getItem(this._setsLocalKey), {});
  }

  /**
   * Save ONE module's metadata to Firebase without touching other modules.
   * This prevents Developer A from overwriting Developer B's data.
   * Use this from section editor pages (section 1/2/3.html).
   */
  async saveSetForModule(module, data) {
    const payload = { ...(data || {}), _updatedAt: new Date().toISOString() };
    try {
      await this._put(`${this._setsPath}/${module}`, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – ${module} set saved to localStorage only:`, e.message);
    }
    // Merge into local cache without wiping other modules
    const local = this._safeParse(localStorage.getItem(this._setsLocalKey), {});
    local[module] = data || {};
    localStorage.setItem(this._setsLocalKey, JSON.stringify(local));
  }

  /**
   * Delete ONE module's metadata and draft from Firebase.
   * Use this from the developer dashboard Delete button.
   */
  async deleteSetForModule(module) {
    try {
      await fetch(this._url(`${this._setsPath}/${module}`), { method: "DELETE" });
      await fetch(this._url(`${this._draftsPath}/${module}`), { method: "DELETE" });
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – ${module} delete queued locally only:`, e.message);
    }
    // Remove from local cache
    const local = this._safeParse(localStorage.getItem(this._setsLocalKey), {});
    delete local[module];
    localStorage.setItem(this._setsLocalKey, JSON.stringify(local));
    localStorage.removeItem(this._draftLocalKey(module));
  }

  /** Save full sets map to Firebase (used only by developer dashboard import). */
  async saveSetsMap(map) {
    const payload = { ...(map || {}), _updatedAt: new Date().toISOString() };
    try {
      await this._put(this._setsPath, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn("[ToeflSync] Offline – sets saved to localStorage only:", e.message);
    }
    localStorage.setItem(this._setsLocalKey, JSON.stringify(map || {}));
  }

  // ─── DRAFTS (full question/passage content) ────────────────────────────────

  _draftLocalKey(module) {
    const keyMap = {
      listening: "toefl_section1_dev_draft_v1",
      structure:  "toefl_section2_dev_draft_v1",
      reading:    "toefl_section3_dev_draft_v1"
    };
    return keyMap[module] || `toefl_${module}_dev_draft_v1`;
  }

  /** Fetch draft for a module from Firebase; falls back to localStorage. */
  async getDraft(module) {
    try {
      const data = await this._get(`${this._draftsPath}/${module}`);
      const draft = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
      localStorage.setItem(this._draftLocalKey(module), JSON.stringify(draft));
      this.isRemoteAvailable = true;
      return draft;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – using localStorage for ${module} draft:`, e.message);
    }
    return this._safeParse(localStorage.getItem(this._draftLocalKey(module)), {});
  }

  /** Save draft for a module to Firebase and localStorage. */
  async saveDraft(module, draft) {
    const payload = { ...(draft || {}), _updatedAt: new Date().toISOString() };
    try {
      await this._put(`${this._draftsPath}/${module}`, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – ${module} draft saved to localStorage only:`, e.message);
    }
    localStorage.setItem(this._draftLocalKey(module), JSON.stringify(draft || {}));
  }

  /** Convenience: returns true if last operation reached Firebase. */
  get online() { return this.isRemoteAvailable; }
}

window.toeflStorage = new ToeflStorageSync();
