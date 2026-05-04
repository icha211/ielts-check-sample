/*
 * TOEFL ITP Shared Storage Sync
 * Uses Firebase Realtime Database so all developers on any device/network
 * can read, write, and edit the same section content and metadata.
 * Falls back gracefully to localStorage when offline.
 *
 * Firebase path layout:
 *   toefl_itp/sets_v1          → section metadata (date, difficulty per module)
 *   toefl_itp/drafts_v1/{mod}  → full draft content per module (listening/structure/reading)
 */

const TOEFL_FIREBASE_URL = "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";

class ToeflStorageSync {
  constructor() {
    this._base = TOEFL_FIREBASE_URL;
    this._setsPath = "toefl_itp/sets_v1";
    this._draftsPath = "toefl_itp/drafts_v1";
    this.isRemoteAvailable = true;
    // localStorage fallback keys
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
