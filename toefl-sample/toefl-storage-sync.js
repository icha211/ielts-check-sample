/*
 * TOEFL ITP Shared Storage Sync
 * Uses Firebase Realtime Database so all developers on any device/network
 * can read, write, and edit the same section content and metadata.
 * Falls back gracefully to localStorage when offline.
 *
 * Firebase path layout:
 *   toefl_itp/sets_v2/{setId}   â†’ section metadata per created set
 *   toefl_itp/drafts_v2/{setId} â†’ full draft content per created set
 *
 * Legacy compatibility (older pages/data):
 *   toefl_itp/sets_v1
 *   toefl_itp/drafts_v1/{module}
 */

const TOEFL_FIREBASE_URL = "https://quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app";
const TOEFL_STORAGE_BUCKET = "quickcheck-25590.firebasestorage.app";
const TOEFL_STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${TOEFL_STORAGE_BUCKET}/o`;
const AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";
const AUDIO_COMPRESS_MIN_BYTES = 8 * 1024 * 1024;
const AUDIO_COMPRESS_TARGET_SAMPLE_RATE = 22050;
const AUDIO_COMPRESS_BITRATE = 96000;

class ToeflStorageSync {
  constructor() {
    this._base = TOEFL_FIREBASE_URL;
    this._setsV2Path = "toefl_itp/sets_v2";
    this._draftsV2Path = "toefl_itp/drafts_v2";
    this._setsPath = "toefl_itp/sets_v1";
    this._draftsPath = "toefl_itp/drafts_v1";
    
    // New paths for mock and practice tests
    this._mockTestSetsPath = "toefl_itp/mocktest/sets_v2";
    this._mockTestDraftsPath = "toefl_itp/mocktest/drafts_v2";
    this._practiceTestSetsPath = "toefl_itp/practicetest/sets_v2";
    this._practiceTestDraftsPath = "toefl_itp/practicetest/drafts_v2";
    
    this.isRemoteAvailable = true;
    // localStorage fallback keys
    this._setsV2LocalKey = "toefl_developer_sets_v2";
    this._draftsV2LocalKey = "toefl_developer_drafts_v2";
    this._setsLocalKey = "toefl_developer_sets_v1";
    this._mockTestSetsLocalKey = "toefl_developer_mocktest_sets_v2";
    this._mockTestDraftsLocalKey = "toefl_developer_mocktest_drafts_v2";
    this._practiceTestSetsLocalKey = "toefl_developer_practicetest_sets_v2";
    this._practiceTestDraftsLocalKey = "toefl_developer_practicetest_drafts_v2";
    this._lastStorageError = "";
    this._lastUploadInfo = null;
  }

  _getPathsForTestType(testType = "mocktest") {
    if (testType === "practicetest") {
      return {
        setsPath: this._practiceTestSetsPath,
        draftsPath: this._practiceTestDraftsPath,
        setsLocalKey: this._practiceTestSetsLocalKey,
        draftsLocalKey: this._practiceTestDraftsLocalKey
      };
    }
    // Default to mocktest
    return {
      setsPath: this._mockTestSetsPath,
      draftsPath: this._mockTestDraftsPath,
      setsLocalKey: this._mockTestSetsLocalKey,
      draftsLocalKey: this._mockTestDraftsLocalKey
    };
  }

  // â”€â”€â”€ DATA MIGRATION & RECOVERY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Migrate old /sets_v2 data to new /mocktest/sets_v2 on first load
  // This ensures no data is lost when new features are added

  async runDataMigration() {
    console.log("[ToeflSync] Starting data migration check...");
    
    try {
      // Check if old data exists
      const oldSets = await this._get(this._setsV2Path);
      const oldDrafts = await this._get(this._draftsV2Path);
      
      if (!oldSets || Object.keys(oldSets).length === 0) {
        console.log("[ToeflSync] No old data to migrate");
        return;
      }

      // Prepare migration map for mocktest (default migration path)
      const mockTestSets = {};
      const mockTestDrafts = {};

      // Migrate sets
      Object.entries(oldSets || {}).forEach(([setId, value]) => {
        if (setId === "_updatedAt") return;
        
        // Add mocktest prefix if not already there
        const migratedId = setId.startsWith("mocktest_") || setId.startsWith("practicetest_") 
          ? setId 
          : `mocktest_${setId}`;
        
        mockTestSets[migratedId] = { ...value, setId: migratedId };
      });

      // Migrate drafts
      Object.entries(oldDrafts || {}).forEach(([setId, value]) => {
        if (setId === "_updatedAt") return;
        
        const migratedId = setId.startsWith("mocktest_") || setId.startsWith("practicetest_") 
          ? setId 
          : `mocktest_${setId}`;
        
        mockTestDrafts[migratedId] = { ...value, setId: migratedId };
      });

      // Save migrated data to new paths
      if (Object.keys(mockTestSets).length > 0) {
        mockTestSets._updatedAt = new Date().toISOString();
        mockTestSets._migratedAt = new Date().toISOString();
        await this._put(this._mockTestSetsPath, mockTestSets);
        console.log(`[ToeflSync] âœ… Migrated ${Object.keys(mockTestSets).length - 2} sets to mocktest`);
      }

      if (Object.keys(mockTestDrafts).length > 0) {
        mockTestDrafts._updatedAt = new Date().toISOString();
        mockTestDrafts._migratedAt = new Date().toISOString();
        await this._put(this._mockTestDraftsPath, mockTestDrafts);
        console.log(`[ToeflSync] âœ… Migrated ${Object.keys(mockTestDrafts).length - 2} drafts to mocktest`);
      }

      // Update localStorage backup
      Object.entries(mockTestSets).forEach(([setId, value]) => {
        if (setId !== "_updatedAt" && setId !== "_migratedAt") {
          const normalized = this._normalizeRecord(value, setId);
          if (normalized) {
            const local = this._safeParse(localStorage.getItem(this._mockTestSetsLocalKey), {});
            local[setId] = normalized;
            localStorage.setItem(this._mockTestSetsLocalKey, JSON.stringify(local));
          }
        }
      });

      console.log("[ToeflSync] âœ… Data migration completed successfully");
      this.isRemoteAvailable = true;
    } catch (e) {
      console.warn("[ToeflSync] Migration failed (may be offline):", e.message);
      // Offline is OK - migration can happen on next online load
    }
  }

  // Archive instead of hard-delete (keeps data in Firebase for recovery)
  async softDeleteSetRecord(setId) {
    if (!setId) return;
    console.log(`[ToeflSync] Soft-deleting (archiving) ${setId}...`);
    
    try {
      const archivedSet = {
        setId,
        _archived: true,
        _archivedAt: new Date().toISOString()
      };
      
      // Save to archive instead of deleting
      await this._put(`toefl_itp/archive/sets_v2/${setId}`, archivedSet);
      console.log(`[ToeflSync] âœ… ${setId} moved to archive (safe to restore)`);
      
      // Now remove from active list
      const paths = this._getPathsForTestType(setId.startsWith("practicetest_") ? "practicetest" : "mocktest");
      const activeSet = await this._get(paths.setsPath);
      if (activeSet && activeSet[setId]) {
        delete activeSet[setId];
        activeSet._updatedAt = new Date().toISOString();
        await this._put(paths.setsPath, activeSet);
      }
      
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Soft-delete failed for ${setId}:`, e.message);
    }
    
    // Remove from local storage
    const localSets = this._safeParse(localStorage.getItem(this._mockTestSetsLocalKey), {});
    delete localSets[setId];
    localStorage.setItem(this._mockTestSetsLocalKey, JSON.stringify(localSets));
  }

  _url(path) {
    return `${this._base}/${path}.json`;
  }

  _isFirebaseRtdbEnabled() {
    return true;
  }

  _markFirebaseRtdbDisabled(reason = "") {
    this.isRemoteAvailable = false;
    if (reason) {
      this._lastStorageError = String(reason);
    }
  }

  _markFirebaseRtdbEnabled() {
    this.isRemoteAvailable = true;
  }

  async _get(path) {
    const r = await fetch(this._url(path), { method: "GET" });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        this._lastStorageError = `Firebase GET failed (${r.status})`;
      }
      throw new Error(`Firebase GET failed (${r.status})`);
    }
    this._markFirebaseRtdbEnabled();
    return r.json();
  }

  async _put(path, data) {
    const r = await fetch(this._url(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) {
        this._lastStorageError = `Firebase PUT failed (${r.status})`;
      }
      throw new Error(`Firebase PUT failed (${r.status})`);
    }
    this._markFirebaseRtdbEnabled();
    return r.json();
  }

  _safeParse(raw, fallback) {
    try { return JSON.parse(raw) || fallback; } catch { return fallback; }
  }

  createSetId(module, setDate, testType = "mocktest") {
    const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(setDate || ""))
      ? String(setDate)
      : new Date().toISOString().split("T")[0];
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `${testType}_${module}_${normalizedDate}_${stamp}_${rand}`;
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

  // â”€â”€â”€ SETS V2 (multi set records) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      console.warn("[ToeflSync] Offline â€“ using localStorage for set records:", e.message);
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
      console.warn(`[ToeflSync] Offline â€“ ${normalized.setId} set saved locally only:`, e.message);
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
      console.warn("[ToeflSync] Offline â€“ set records saved locally only:", e.message);
    }
    localStorage.setItem(this._setsV2LocalKey, JSON.stringify(map));
  }

  async deleteSetRecord(setId) {
    if (!setId) return;
    
    console.log(`[ToeflSync] Archiving (soft-delete) ${setId}...`);
    
    try {
      // Move to archive instead of hard delete
      const setRecord = await this._get(`${this._setsV2Path}/${setId}`).catch(() => ({}));
      const draftRecord = await this._get(`${this._draftsV2Path}/${setId}`).catch(() => ({}));
      
      // Save to archive with metadata
      const archivedSet = {
        ...setRecord,
        _archived: true,
        _archivedAt: new Date().toISOString(),
        _archivedFromPath: this._setsV2Path
      };
      
      await this._put(`toefl_itp/archive/sets_v2/${setId}`, archivedSet);
      
      if (Object.keys(draftRecord).length > 0) {
        const archivedDraft = {
          ...draftRecord,
          _archived: true,
          _archivedAt: new Date().toISOString()
        };
        await this._put(`toefl_itp/archive/drafts_v2/${setId}`, archivedDraft);
      }
      
      console.log(`[ToeflSync] âœ… ${setId} archived to backup (can be restored)`);
      
      // Now remove from active list
      const activeSets = await this._get(this._setsV2Path).catch(() => ({}));
      if (activeSets && activeSets[setId]) {
        delete activeSets[setId];
        activeSets._updatedAt = new Date().toISOString();
        await this._put(this._setsV2Path, activeSets);
      }
      
      const activeDrafts = await this._get(this._draftsV2Path).catch(() => ({}));
      if (activeDrafts && activeDrafts[setId]) {
        delete activeDrafts[setId];
        activeDrafts._updatedAt = new Date().toISOString();
        await this._put(this._draftsV2Path, activeDrafts);
      }
      
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Soft-delete failed for ${setId}:`, e.message);
      throw e;
    }
    
    // Remove from local storage
    const localSets = this._safeParse(localStorage.getItem(this._setsV2LocalKey), {});
    delete localSets[setId];
    localStorage.setItem(this._setsV2LocalKey, JSON.stringify(localSets));
    const localDrafts = this._safeParse(localStorage.getItem(this._draftsV2LocalKey), {});
    delete localDrafts[setId];
    localStorage.setItem(this._draftsV2LocalKey, JSON.stringify(localDrafts));
  }

  // â”€â”€â”€ SETS V2 WITH TEST TYPE SUPPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getSetRecordsByTestType(testType = "mocktest") {
    const paths = this._getPathsForTestType(testType);
    try {
      const v2 = await this._get(paths.setsPath);
      const v2Map = (v2 && typeof v2 === "object" && !Array.isArray(v2)) ? v2 : {};
      const records = Object.entries(v2Map)
        .filter(([key]) => key !== "_updatedAt")
        .map(([setId, value]) => this._normalizeRecord({ ...value, setId }, setId))
        .filter(Boolean);
      if (records.length > 0) {
        localStorage.setItem(paths.setsLocalKey, JSON.stringify(this._recordsToMap(records)));
        this.isRemoteAvailable = true;
        return records;
      }
      this.isRemoteAvailable = true;
      return [];
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline â€“ using localStorage for ${testType} set records:`, e.message);
    }

    const localV2 = this._safeParse(localStorage.getItem(paths.setsLocalKey), {});
    const localRecords = Object.entries(localV2 || {})
      .map(([setId, value]) => this._normalizeRecord({ ...value, setId }, setId))
      .filter(Boolean);
    return localRecords;
  }

  async getSetRecordByIdAndType(setId, testType = "mocktest") {
    if (!setId) return null;
    const paths = this._getPathsForTestType(testType);
    try {
      const data = await this._get(`${paths.setsPath}/${setId}`);
      const normalized = this._normalizeRecord({ ...data, setId }, setId);
      if (normalized) {
        const local = this._safeParse(localStorage.getItem(paths.setsLocalKey), {});
        local[setId] = normalized;
        localStorage.setItem(paths.setsLocalKey, JSON.stringify(local));
      }
      this.isRemoteAvailable = true;
      return normalized;
    } catch {
      this.isRemoteAvailable = false;
    }
    const local = this._safeParse(localStorage.getItem(paths.setsLocalKey), {});
    return this._normalizeRecord({ ...(local[setId] || {}), setId }, setId);
  }

  async upsertSetRecordWithType(record, testType = "mocktest") {
    const normalized = this._normalizeRecord(record, record?.setId);
    if (!normalized) throw new Error("Invalid set record");
    const paths = this._getPathsForTestType(testType);
    const payload = { ...normalized, _updatedAt: new Date().toISOString() };
    try {
      await this._put(`${paths.setsPath}/${normalized.setId}`, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline â€“ ${normalized.setId} set saved locally only:`, e.message);
    }
    const local = this._safeParse(localStorage.getItem(paths.setsLocalKey), {});
    local[normalized.setId] = normalized;
    localStorage.setItem(paths.setsLocalKey, JSON.stringify(local));
    return normalized;
  }

  async saveSetRecordsWithType(records, testType = "mocktest") {
    const normalized = (records || [])
      .map((item) => this._normalizeRecord(item, item?.setId))
      .filter(Boolean);
    const paths = this._getPathsForTestType(testType);
    const map = this._recordsToMap(normalized);
    const payload = { ...map, _updatedAt: new Date().toISOString() };
    try {
      await this._put(paths.setsPath, payload);
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline â€“ ${testType} set records saved locally only:`, e.message);
    }
    localStorage.setItem(paths.setsLocalKey, JSON.stringify(map));
  }

  async deleteSetRecordWithType(setId, testType = "mocktest") {
    if (!setId) return;
    const paths = this._getPathsForTestType(testType);
    
    console.log(`[ToeflSync] Archiving (soft-delete) ${setId} from ${testType}...`);
    
    try {
      // Move to archive instead of hard delete
      const setRecord = await this._get(`${paths.setsPath}/${setId}`).catch(() => ({}));
      const draftRecord = await this._get(`${paths.draftsPath}/${setId}`).catch(() => ({}));
      
      // Save to archive with metadata
      const archivedSet = {
        ...setRecord,
        _archived: true,
        _archivedAt: new Date().toISOString(),
        _archivedFrom: testType,
        _archivedFromPath: paths.setsPath
      };
      
      await this._put(`toefl_itp/archive/${testType}/sets/${setId}`, archivedSet);
      
      if (Object.keys(draftRecord).length > 0) {
        const archivedDraft = {
          ...draftRecord,
          _archived: true,
          _archivedAt: new Date().toISOString()
        };
        await this._put(`toefl_itp/archive/${testType}/drafts/${setId}`, archivedDraft);
      }
      
      console.log(`[ToeflSync] âœ… ${setId} archived to backup (can be restored)`);
      
      // Now remove from active list
      const activeSets = await this._get(paths.setsPath).catch(() => ({}));
      if (activeSets && activeSets[setId]) {
        delete activeSets[setId];
        activeSets._updatedAt = new Date().toISOString();
        await this._put(paths.setsPath, activeSets);
      }
      
      const activeDrafts = await this._get(paths.draftsPath).catch(() => ({}));
      if (activeDrafts && activeDrafts[setId]) {
        delete activeDrafts[setId];
        activeDrafts._updatedAt = new Date().toISOString();
        await this._put(paths.draftsPath, activeDrafts);
      }
      
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Soft-delete failed for ${setId}:`, e.message);
      throw e;
    }
    
    // Remove from local storage
    const localSets = this._safeParse(localStorage.getItem(paths.setsLocalKey), {});
    delete localSets[setId];
    localStorage.setItem(paths.setsLocalKey, JSON.stringify(localSets));
    const localDrafts = this._safeParse(localStorage.getItem(paths.draftsLocalKey), {});
    delete localDrafts[setId];
    localStorage.setItem(paths.draftsLocalKey, JSON.stringify(localDrafts));
  }

  async getDraftBySetIdAndType(setId, testType = "mocktest") {
    if (!setId) return {};
    const paths = this._getPathsForTestType(testType);
    try {
      const data = await this._get(`${paths.draftsPath}/${setId}`);
      const draft = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
      const local = this._safeParse(localStorage.getItem(paths.draftsLocalKey), {});
      local[setId] = draft;
      localStorage.setItem(paths.draftsLocalKey, JSON.stringify(local));
      this.isRemoteAvailable = true;
      return draft;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline â€“ using localStorage for ${testType} set draft ${setId}:`, e.message);
    }
    const local = this._safeParse(localStorage.getItem(paths.draftsLocalKey), {});
    return local[setId] || {};
  }

  async saveDraftBySetIdAndType(setId, module, draft, testType = "mocktest") {
       if (!setId) throw new Error("setId is required");
       const paths = this._getPathsForTestType(testType);
       const payload = {
         ...(draft || {}),
         setId,
         module: String(module || draft?.module || ""),
         _updatedAt: new Date().toISOString()
       };
       try {
         await this._put(`${paths.draftsPath}/${setId}`, payload);
         this.isRemoteAvailable = true;
       } catch (e) {
         this.isRemoteAvailable = false;
         console.warn(`[ToeflSync] Offline â€“ ${testType} set draft ${setId} saved locally only:`, e.message);
       }
       const local = this._safeParse(localStorage.getItem(paths.draftsLocalKey), {});
       local[setId] = draft || {};
       localStorage.setItem(paths.draftsLocalKey, JSON.stringify(local));
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
         console.warn(`[ToeflSync] Offline â€“ using localStorage for set draft ${setId}:`, e.message);
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
         console.warn(`[ToeflSync] Offline â€“ set draft ${setId} saved locally only:`, e.message);
       }
       const local = this._safeParse(localStorage.getItem(this._draftsV2LocalKey), {});
       local[setId] = draft || {};
       localStorage.setItem(this._draftsV2LocalKey, JSON.stringify(local));
     }

     // â”€â”€â”€ SETS (section metadata: date, difficulty) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
         console.warn("[ToeflSync] Offline â€“ using localStorage for sets:", e.message);
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
         console.warn(`[ToeflSync] Offline â€“ ${module} set saved to localStorage only:`, e.message);
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
         const [setRes, draftRes] = await Promise.all([
           fetch(this._url(`${this._setsPath}/${module}`), { method: "DELETE" }),
           fetch(this._url(`${this._draftsPath}/${module}`), { method: "DELETE" })
         ]);
         const setDeleteOk = setRes.ok || setRes.status === 404;
         const draftDeleteOk = draftRes.ok || draftRes.status === 404;
         if (!setDeleteOk || !draftDeleteOk) {
           throw new Error(`Delete failed (set:${setRes.status}, draft:${draftRes.status})`);
         }
         this.isRemoteAvailable = true;
       } catch (e) {
         this.isRemoteAvailable = false;
         console.warn(`[ToeflSync] Offline â€“ ${module} delete queued locally only:`, e.message);
         throw e;
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
         console.warn("[ToeflSync] Offline â€“ sets saved to localStorage only:", e.message);
       }
       localStorage.setItem(this._setsLocalKey, JSON.stringify(map || {}));
     }

     // â”€â”€â”€ DRAFTS (full question/passage content) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
         console.warn(`[ToeflSync] Offline â€“ using localStorage for ${module} draft:`, e.message);
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
         console.warn(`[ToeflSync] Offline â€“ ${module} draft saved to localStorage only:`, e.message);
       }
       localStorage.setItem(this._draftLocalKey(module), JSON.stringify(draft || {}));
     }

     // â”€â”€â”€ AUDIO FILES (Firebase Storage + RTDB URL index) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

     _getStorageBases() {
       const bases = [TOEFL_STORAGE_BASE];
       if (TOEFL_STORAGE_BUCKET.endsWith(".firebasestorage.app")) {
         const legacyBucket = TOEFL_STORAGE_BUCKET.replace(".firebasestorage.app", ".appspot.com");
         bases.push(`https://firebasestorage.googleapis.com/v0/b/${legacyBucket}/o`);
       }
       return Array.from(new Set(bases));
     }

     getLastStorageError() {
       return this._lastStorageError || "";
     }

     getLastUploadInfo() {
       return this._lastUploadInfo || null;
     }

     _extractPrimaryDownloadToken(rawTokenValue) {
       const raw = String(rawTokenValue || "").trim();
       if (!raw) return "";
       // Firebase can return multiple tokens as a comma-separated string.
       return raw.split(",").map((item) => item.trim()).filter(Boolean)[0] || "";
     }

     _extractTokenFromUrl(url) {
       if (!url) return "";
       const tokenMatch = String(url).match(/[?&]token=([^&]+)/i);
       if (!tokenMatch) return "";
       return this._extractPrimaryDownloadToken(decodeURIComponent(tokenMatch[1] || ""));
     }

     _buildStorageDownloadUrl(base, storagePath, token = "") {
       if (!base || !storagePath) return "";
       const encodedPath = encodeURIComponent(storagePath);
       const normalizedToken = this._extractPrimaryDownloadToken(token);
       const tokenQuery = normalizedToken ? `&token=${encodeURIComponent(normalizedToken)}` : "";
       return `${base}/${encodedPath}?alt=media${tokenQuery}`;
     }

     _pickCompressionMimeType() {
       if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
         return "";
       }

       const candidates = [
         "audio/webm;codecs=opus",
         "audio/webm",
         "audio/ogg;codecs=opus",
         "audio/ogg"
       ];

       return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
     }

     async _resampleAudioBuffer(audioBuffer, targetSampleRate) {
       const OfflineAudioContextCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
       if (!OfflineAudioContextCtor || !targetSampleRate || targetSampleRate >= audioBuffer.sampleRate) {
         return audioBuffer;
       }

       const numberOfChannels = Math.min(Math.max(Number(audioBuffer.numberOfChannels || 1), 1), 2);
       const frameCount = Math.ceil(audioBuffer.duration * targetSampleRate);
       const offlineContext = new OfflineAudioContextCtor(numberOfChannels, frameCount, targetSampleRate);
       const source = offlineContext.createBufferSource();
       source.buffer = audioBuffer;
       source.connect(offlineContext.destination);
       source.start(0);
       return offlineContext.startRendering();
     }

     async _compressAudioBlob(audioBlob) {
       if (!audioBlob || typeof window === "undefined") return audioBlob;

       const mimeType = this._pickCompressionMimeType();
       const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
       if (!AudioContextCtor || !mimeType) return audioBlob;

       const arrayBuffer = await audioBlob.arrayBuffer();
       const decodeContext = new AudioContextCtor();

       try {
         const decodedBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice());
         const targetSampleRate = Math.min(decodedBuffer.sampleRate || AUDIO_COMPRESS_TARGET_SAMPLE_RATE, AUDIO_COMPRESS_TARGET_SAMPLE_RATE);
         const renderedBuffer = await this._resampleAudioBuffer(decodedBuffer, targetSampleRate);
         const recordContext = new AudioContextCtor({ sampleRate: renderedBuffer.sampleRate });

         try {
           const destination = recordContext.createMediaStreamDestination();
           const source = recordContext.createBufferSource();
           source.buffer = renderedBuffer;
           source.connect(destination);

           const chunks = [];
           const compressedBlob = await new Promise((resolve, reject) => {
             let recorder;

             try {
               recorder = new MediaRecorder(destination.stream, {
                 mimeType,
                 audioBitsPerSecond: AUDIO_COMPRESS_BITRATE
               });
             } catch (error) {
               reject(error);
               return;
             }

             recorder.ondataavailable = (event) => {
               if (event.data && event.data.size > 0) chunks.push(event.data);
             };
             recorder.onerror = () => reject(recorder.error || new Error("Audio compression failed"));
             recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
             source.onended = () => {
               if (recorder.state !== "inactive") recorder.stop();
             };

             recorder.start();
             recordContext.resume?.().catch(() => {});
             source.start(0);
           });

           const compressedSize = Number(compressedBlob?.size || 0);
           if (compressedBlob && compressedSize > 0 && compressedSize < Number(audioBlob.size || 0)) {
             return compressedBlob;
           }
           return audioBlob;
         } finally {
           await recordContext.close().catch(() => {});
         }
       } catch {
         return audioBlob;
       } finally {
         await decodeContext.close().catch(() => {});
       }
     }

     async _prepareAudioUpload(audioBlob) {
       const originalSize = Number(audioBlob?.size || 0);
       const originalName = String(audioBlob?.name || "audio");
       const shouldCompress = originalSize >= AUDIO_COMPRESS_MIN_BYTES;
       const uploadedBlob = shouldCompress ? await this._compressAudioBlob(audioBlob) : audioBlob;
       const compressed = uploadedBlob !== audioBlob && Number(uploadedBlob?.size || 0) > 0 && Number(uploadedBlob.size || 0) < originalSize;
       const contentType = String(uploadedBlob?.type || audioBlob?.type || "audio/mpeg");

       return {
         blob: uploadedBlob,
         compressed,
         contentType,
         originalName,
         originalSize,
         uploadedSize: Number(uploadedBlob?.size || 0)
       };
     }

     _buildMultipartUploadBody(storagePath, audioBlob, contentType) {
       const boundary = `----toeflAudioBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
       const metadata = JSON.stringify({
         name: storagePath,
         contentType,
         cacheControl: AUDIO_CACHE_CONTROL
       });

       return {
         boundary,
         body: new Blob([
           `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
           metadata,
           `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
           audioBlob,
           `\r\n--${boundary}--`
         ], { type: `multipart/related; boundary=${boundary}` })
       };
     }

     _extractStoragePathFromUrl(url) {
       const text = String(url || "");
       const marker = "/o/";
       const markerIndex = text.indexOf(marker);
       if (markerIndex < 0) return "";
       const encodedPath = text.slice(markerIndex + marker.length).split("?")[0] || "";
       if (!encodedPath) return "";
       try {
         return decodeURIComponent(encodedPath);
       } catch {
         return "";
       }
     }

     _guessAudioExtension(fileName = "", mimeType = "") {
       const safeName = String(fileName || "").trim();
       const fromName = safeName.includes(".") ? safeName.split(".").pop().toLowerCase() : "";
       if (fromName) return fromName;

       const type = String(mimeType || "").toLowerCase();
       if (type.includes("mpeg")) return "mp3";
       if (type.includes("mp4") || type.includes("m4a")) return "m4a";
       if (type.includes("wav")) return "wav";
       if (type.includes("ogg")) return "ogg";
       if (type.includes("aac")) return "aac";
       if (type.includes("webm")) return "webm";
       return "mp3";
     }

     _buildAudioUrlCandidates(setId, partId, preferredUrl = "", storagePathOverride = "") {
       const fallbackPath = `toefl_itp/audio/${setId}/part_${partId}`;
       const storagePath = String(storagePathOverride || "").trim() || this._extractStoragePathFromUrl(preferredUrl) || fallbackPath;
       const token = this._extractTokenFromUrl(preferredUrl);

       const candidates = [];
       for (const base of this._getStorageBases()) {
         candidates.push(this._buildStorageDownloadUrl(base, storagePath, token));
         candidates.push(this._buildStorageDownloadUrl(base, storagePath));
       }

       if (preferredUrl) {
         candidates.unshift(preferredUrl);
       }

       return Array.from(new Set(candidates));
     }

     getAudioUrlCandidates(setId, partId = 1, preferredUrl = "") {
       return this._buildAudioUrlCandidates(setId, partId, preferredUrl);
     }

     async getAudioIndexMap() {
       try {
         const data = await this._get("toefl_itp/audio_urls");
         this.isRemoteAvailable = true;
         return (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
       } catch (e) {
         this.isRemoteAvailable = false;
         console.warn("[ToeflSync] Audio index fetch failed:", e.message);
         return {};
       }
     }

     _getApiGatewayBase() {
       const baseOverride = String(localStorage.getItem("toefl_api_gateway_url") || "").trim();
       if (baseOverride) {
         return baseOverride.replace(/\/+$/, "");
       }

       const runtimeHost = (typeof window !== "undefined" && window.location && window.location.hostname)
         ? window.location.hostname
         : "";
       const hostOverride = String(localStorage.getItem("toefl_api_gateway_host") || "").trim();
       const host = hostOverride || runtimeHost || "127.0.0.1";
       const port = String(localStorage.getItem("toefl_api_gateway_port") || "8000").trim() || "8000";
       const protocol = String(localStorage.getItem("toefl_api_gateway_protocol") || "http").trim() || "http";
       return `${protocol}://${host}:${port}`;
     }

     async testApiGatewayConnection() {
       const apiBase = this._getApiGatewayBase();
       try {
         const response = await fetch(`${apiBase}/api/docs`, { method: "HEAD" });
         return response.ok;
       } catch {
         return false;
       }
     }

     setApiGatewayUrl(url) {
       if (typeof url === "string" && url.trim()) {
         localStorage.setItem("toefl_api_gateway_url", url.replace(/\/+$/, ""));
       } else {
         localStorage.removeItem("toefl_api_gateway_url");
       }
     }

     setApiGatewayHost(host) {
       if (typeof host === "string" && host.trim()) {
         localStorage.setItem("toefl_api_gateway_host", host.trim());
       } else {
         localStorage.removeItem("toefl_api_gateway_host");
       }
     }

     setApiGatewayPort(port) {
       if ((typeof port === "string" || typeof port === "number") && String(port).trim()) {
         localStorage.setItem("toefl_api_gateway_port", String(port).trim());
       } else {
         localStorage.removeItem("toefl_api_gateway_port");
       }
     }

     setApiGatewayProtocol(protocol) {
       if (typeof protocol === "string" && protocol.trim()) {
         localStorage.setItem("toefl_api_gateway_protocol", protocol.trim().toLowerCase());
       } else {
         localStorage.removeItem("toefl_api_gateway_protocol");
       }
     }

     getApiGatewayConfig() {
       return {
         baseUrl: this._getApiGatewayBase(),
         host: String(localStorage.getItem("toefl_api_gateway_host") || "").trim() || "auto-detected",
         port: String(localStorage.getItem("toefl_api_gateway_port") || "8000").trim(),
         protocol: String(localStorage.getItem("toefl_api_gateway_protocol") || "http").trim()
       };
     }

     async saveAudioViaGateway(setId, audioBlob, partId = 1) {
       if (!setId || !audioBlob) {
         this._lastStorageError = "Missing setId or audioBlob";
         return false;
       }

       const prepared = await this._prepareAudioUpload(audioBlob);
       const fileName = String(prepared.originalName || `part_${partId}.mp3`);
       const fileType = String(prepared.contentType || "audio/mpeg");
       const apiBase = this._getApiGatewayBase();

       try {
         let presignRes;
         try {
           presignRes = await Promise.race([
             fetch(`${apiBase}/api/developer/upload-url`, {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ fileName, fileType })
             }),
             new Promise((_, reject) => setTimeout(() => reject(new Error("API gateway request timeout after 10s")), 10000))
           ]);
         } catch (fetchError) {
           const msg = String(fetchError?.message || fetchError || "");
           if (msg.includes("timeout")) {
             throw new Error(`API gateway not responding at ${apiBase}. Ensure gateway is running (python -m uvicorn apps.api-gateway.main:app --port 8000 --reload)`);
           }
           throw new Error(`Failed to reach API gateway at ${apiBase}: ${msg}`);
         }

         if (!presignRes.ok) {
           const detail = await presignRes.text().catch(() => "");
           throw new Error(detail || `upload-url request failed (${presignRes.status})`);
         }

         const payload = await presignRes.json();
         const uploadUrl = String(payload?.uploadUrl || "").trim();
         let objectKey = String(payload?.objectKey || "").trim();
         let objectUrl = String(payload?.objectUrl || "").trim();

         if (!uploadUrl || !objectUrl) {
           throw new Error("upload-url response missing uploadUrl/objectUrl");
         }

         let uploadedVia = "presigned-put";
         try {
           const putRes = await fetch(uploadUrl, {
             method: "PUT",
             headers: {
               "Content-Type": fileType
             },
             body: prepared.blob
           });

           if (!putRes.ok) {
             throw new Error(`R2 upload failed (${putRes.status})`);
           }
         } catch (putError) {
           // Fallback path for browsers that block direct PUT because of CORS/policy.
           const form = new FormData();
           form.append("file", prepared.blob, fileName);
           form.append("fileName", fileName);
           form.append("fileType", fileType);

           const proxyRes = await fetch(`${apiBase}/api/developer/upload-proxy`, {
             method: "POST",
             body: form
           });

           if (!proxyRes.ok) {
             const proxyDetail = await proxyRes.text().catch(() => "");
             const basePutError = String(putError?.message || putError || "Direct upload failed");
             throw new Error(`${basePutError}; proxy upload failed (${proxyRes.status}) ${proxyDetail}`.trim());
           }

           const proxyPayload = await proxyRes.json();
           objectKey = String(proxyPayload?.objectKey || objectKey).trim();
           objectUrl = String(proxyPayload?.objectUrl || objectUrl).trim();
           if (!objectUrl) {
             throw new Error("proxy upload response missing objectUrl");
           }
           uploadedVia = "proxy-upload";
         }

         await this._put(`toefl_itp/audio_urls/${setId}/part_${partId}`, {
           url: objectUrl,
           objectKey,
           storageProvider: "r2",
           candidateUrls: [objectUrl],
           compressed: Boolean(prepared.compressed),
           originalName: prepared.originalName,
           originalSize: prepared.originalSize,
           uploadedSize: prepared.uploadedSize,
           contentType: prepared.contentType,
           fileName: prepared.originalName || `audio_part${partId}`,
           size: prepared.uploadedSize,
           type: prepared.contentType,
           uploadedAt: new Date().toISOString()
         });

         this.isRemoteAvailable = true;
         this._lastStorageError = "";
         this._lastUploadInfo = {
           success: true,
           setId,
           partId,
           storageProvider: "r2",
           uploadPath: uploadedVia,
           objectKey,
           objectUrl,
           compressed: Boolean(prepared.compressed),
           originalSize: prepared.originalSize,
           uploadedSize: prepared.uploadedSize,
           contentType: prepared.contentType
         };

         return this._lastUploadInfo;
       } catch (error) {
         this.isRemoteAvailable = false;
         this._lastStorageError = String(error?.message || error || "Gateway audio upload failed");
         this._lastUploadInfo = { success: false, setId, partId, error: this._lastStorageError };
         return false;
       }
     }

     /**
      * Upload audio file to Firebase Storage and save download URL in RTDB.
      * @param {string} setId
      * @param {Blob|File} audioBlob
      * @param {number} partId
      * @returns {Promise<boolean>}
      */
     async saveAudioToFirebase(setId, audioBlob, partId = 1) {
       if (!setId || !audioBlob) {
         this._lastStorageError = "Missing setId or audioBlob";
         console.warn("[ToeflSync] Missing setId or audioBlob for audio upload");
         return false;
       }

       const prepared = await this._prepareAudioUpload(audioBlob);
       const extension = this._guessAudioExtension(prepared.originalName || "", prepared.contentType || "");
       const storagePath = `toefl_itp/audio/${setId}/part_${partId}.${extension}`;
       const uploadNameQuery = new URLSearchParams({ name: storagePath }).toString();
       const errors = [];

       for (const base of this._getStorageBases()) {
         try {
           const multipart = this._buildMultipartUploadBody(storagePath, prepared.blob, prepared.contentType);
           const res = await fetch(`${base}?uploadType=multipart&${uploadNameQuery}`, {
             method: "POST",
             headers: { "Content-Type": `multipart/related; boundary=${multipart.boundary}` },
             body: multipart.body
           });

           if (!res.ok) {
             const errorText = await res.text().catch(() => "");
             errors.push(`${base} -> ${res.status} ${errorText}`);
             continue;
           }

           const meta = await res.json();
           const token = this._extractPrimaryDownloadToken(
             meta?.downloadTokens ||
             meta?.downloadToken ||
             meta?.metadata?.firebaseStorageDownloadTokens ||
             ""
           );
           const downloadUrl = this._buildStorageDownloadUrl(base, storagePath, token);
           const candidateUrls = Array.from(new Set([
             meta?.mediaLink,
             meta?.downloadUrl,
             meta?.downloadURL,
             downloadUrl,
             ...this._buildAudioUrlCandidates(setId, partId, downloadUrl, storagePath)
           ].map((item) => String(item || "").trim()).filter(Boolean)));

           await this._put(`toefl_itp/audio_urls/${setId}/part_${partId}`, {
             url: downloadUrl,
             mediaLink: String(meta?.mediaLink || ""),
             storagePath,
             token,
             cacheControl: AUDIO_CACHE_CONTROL,
             compressed: Boolean(prepared.compressed),
             originalName: prepared.originalName,
             originalSize: prepared.originalSize,
             uploadedSize: prepared.uploadedSize,
             contentType: prepared.contentType,
             candidateUrls,
             fileName: prepared.originalName || `audio_part${partId}`,
             size: prepared.uploadedSize,
             type: prepared.contentType,
             uploadedAt: new Date().toISOString()
           });

           this.isRemoteAvailable = true;
           this._lastStorageError = "";
           this._lastUploadInfo = {
             success: true,
             setId,
             partId,
             storagePath,
             compressed: Boolean(prepared.compressed),
             originalSize: prepared.originalSize,
             uploadedSize: prepared.uploadedSize,
             contentType: prepared.contentType,
             cacheControl: AUDIO_CACHE_CONTROL,
             base
           };
           console.log("[ToeflSync] Audio uploaded to Storage:", { setId, partId, size: prepared.uploadedSize, base, compressed: prepared.compressed });
           return this._lastUploadInfo;
         } catch (e) {
           errors.push(`${base} -> ${e?.message || String(e)}`);
         }
       }

       this.isRemoteAvailable = false;
       this._lastStorageError = errors.join(" | ");
       this._lastUploadInfo = { success: false, setId, partId, error: this._lastStorageError };
       console.warn(`[ToeflSync] Storage upload failed - ${setId} part ${partId}:`, this._lastStorageError);
       return false;
     }

     /**
      * Get download URL for an audio file from RTDB URL index.
      * @param {string} setId
      * @param {number} partId
      * @returns {Promise<string|null>}
      */
     async getAudioFromFirebase(setId, partId = 1) {
       if (!setId) return null;
       try {
         const data = await this._get(`toefl_itp/audio_urls/${setId}/part_${partId}`);
         const savedUrl = data && data.url ? String(data.url) : "";
         if (!savedUrl) return null;
         this.isRemoteAvailable = true;
         return savedUrl;
       } catch (e) {
         this.isRemoteAvailable = false;
         console.warn(`[ToeflSync] Storage URL fetch failed - ${setId} part ${partId}:`, e.message);
         return null;
       }
     }

     async getAudioRecordFromFirebase(setId, partId = 1) {
       if (!setId) return null;
       try {
         const data = await this._get(`toefl_itp/audio_urls/${setId}/part_${partId}`);
         return (data && typeof data === "object" && !Array.isArray(data)) ? data : null;
       } catch {
         return null;
       }
     }

     async _probeAudioUrl(url) {
       if (!url) return false;
       try {
         const res = await fetch(url, {
           method: "GET",
           headers: { Range: "bytes=0-1023" }
         });
         if (!res.ok) return false;

         const contentType = String(res.headers.get("content-type") || "").toLowerCase();
         if (!contentType) return true;
         if (contentType.startsWith("audio/")) return true;
         if (contentType.includes("application/octet-stream")) return true;
         if (contentType.includes("application/json") || contentType.includes("text/html") || contentType.includes("text/plain")) {
           return false;
         }
         return true;
       } catch {
         return false;
       }
     }

     async getPlayableAudioFromFirebase(setId, partId = 1) {
       const record = await this.getAudioRecordFromFirebase(setId, partId);
       const savedUrl = String(record?.url || "").trim();
       const objectKey = String(record?.objectKey || "").trim();
       const storagePath = String(record?.storagePath || "").trim();
       const storedCandidates = Array.isArray(record?.candidateUrls) ? record.candidateUrls : [];

       if (objectKey) {
         try {
           const apiBase = this._getApiGatewayBase();
           const response = await fetch(`${apiBase}/api/developer/audio-url?objectKey=${encodeURIComponent(objectKey)}`, {
             method: "GET"
           });
           if (response.ok) {
             const payload = await response.json().catch(() => ({}));
             const signedUrl = String(payload?.audioUrl || "").trim();
             if (signedUrl) {
               return signedUrl;
             }
           }
         } catch {
           // Fall through to legacy candidate probing.
         }
       }

       const candidates = Array.from(new Set([
         savedUrl,
         String(record?.mediaLink || "").trim(),
         ...storedCandidates,
         ...this._buildAudioUrlCandidates(setId, partId, savedUrl, storagePath)
       ].filter(Boolean)));

       if (candidates.length === 0) return null;

       const fallbackCandidate = candidates.find((url) => url && url !== savedUrl) || savedUrl;
       for (const url of candidates) {
         if (await this._probeAudioUrl(url)) {
           return url;
         }
       }

       // Probing can fail because of CORS even when media playback succeeds in <audio>.
       return fallbackCandidate;
     }

     async saveTranscriptTextToFirebase(setId, transcriptText, partId = 1) {
       if (!setId) return false;
       const textPayload = String(transcriptText || "");
       const storagePath = `toefl_itp/transcripts/${setId}/part_${partId}.txt`;
       const uploadNameQuery = new URLSearchParams({ name: storagePath }).toString();

       for (const base of this._getStorageBases()) {
         try {
           const res = await fetch(`${base}?uploadType=media&${uploadNameQuery}`, {
             method: "POST",
             headers: { "Content-Type": "text/plain; charset=utf-8" },
             body: textPayload
           });
           if (!res.ok) continue;

           const meta = await res.json();
           const token = this._extractPrimaryDownloadToken(
             meta?.downloadTokens ||
             meta?.downloadToken ||
             meta?.metadata?.firebaseStorageDownloadTokens ||
             ""
           );
           const downloadUrl = this._buildStorageDownloadUrl(base, storagePath, token);

           await this._put(`toefl_itp/transcript_urls/${setId}/part_${partId}`, {
             url: downloadUrl,
             storagePath,
             token,
             uploadedAt: new Date().toISOString()
           });

           this.isRemoteAvailable = true;
           return true;
         } catch {
           // Try next base alias
         }
       }

       this.isRemoteAvailable = false;
       return false;
     }

     async getTranscriptTextFromFirebase(setId, partId = 1) {
       if (!setId) return "";
       try {
         const data = await this._get(`toefl_itp/transcript_urls/${setId}/part_${partId}`);
         const url = String(data?.url || "").trim();
         if (!url) return "";
         const res = await fetch(url, { method: "GET" });
         if (!res.ok) return "";
         this.isRemoteAvailable = true;
         return await res.text();
       } catch {
         this.isRemoteAvailable = false;
         return "";
       }
     }

     _getLocalStorageServerBase() {
       const runtimeHost = (typeof window !== "undefined" && window.location && window.location.hostname)
         ? window.location.hostname
         : "127.0.0.1";
       const host = localStorage.getItem("toefl_storage_server_host") || runtimeHost;
       const port = localStorage.getItem("toefl_storage_server_port") || "8788";
       return `http://${host}:${port}`;
     }

     getAudioUrlFromLocalServer(setId, partId = 1) {
       if (!setId) return "";
       return `${this._getLocalStorageServerBase()}/api/audio/download/${encodeURIComponent(setId)}/${Number(partId || 1)}`;
     }

     async transcribeAudioBySetPart(setId, partId = 1) {
       if (!setId) throw new Error("setId is required for transcription");
       let response;
       try {
         response = await fetch(`${this._getLocalStorageServerBase()}/api/problems`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             action: "transcribe-audio",
             setId: String(setId),
             partId: Number(partId || 1)
           })
         });
       } catch (error) {
         const reason = error && error.message ? String(error.message) : "Network request failed";
         throw new Error(`Cannot reach local storage server at ${this._getLocalStorageServerBase()}. Start data_storage_server.py first. (${reason})`);
       }

       let payload = {};
       try {
         payload = await response.json();
       } catch {
         payload = {};
       }

       if (!response.ok || payload.success !== true) {
         const message = String(payload.error || `Transcription failed (${response.status})`);
         throw new Error(message);
       }

       return String(payload.transcript || "");
     }

     async transcribeAudioBlob(audioBlob, fileName = "audio", mimeType = "audio/mpeg", partId = 1) {
       if (!audioBlob) throw new Error("audioBlob is required for transcription");

       const base64Data = await new Promise((resolve, reject) => {
         const reader = new FileReader();
         reader.onload = () => resolve(String(reader.result || ""));
         reader.onerror = reject;
         reader.readAsDataURL(audioBlob);
       });
       const base64String = base64Data.split(",")[1] || base64Data;

       let response;
       try {
         response = await fetch(`${this._getLocalStorageServerBase()}/api/problems`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({
             action: "transcribe-audio-bytes",
             audioData: base64String,
             fileName: String(fileName || "audio"),
             mimeType: String(mimeType || "audio/mpeg"),
             partId: Number(partId || 1)
           })
         });
       } catch (error) {
         const reason = error && error.message ? String(error.message) : "Network request failed";
         throw new Error(`Cannot reach local storage server at ${this._getLocalStorageServerBase()}. Start data_storage_server.py first. (${reason})`);
       }

       let payload = {};
       try {
         payload = await response.json();
       } catch {
         payload = {};
       }

       if (!response.ok || payload.success !== true) {
         const message = String(payload.error || `Transcription failed (${response.status})`);
         throw new Error(message);
       }

       return String(payload.transcript || "");
     }

     async getTranscriptTextFromLocalServer(setId, partId = 1) {
       if (!setId) return "";
       const response = await fetch(
         `${this._getLocalStorageServerBase()}/api/transcript/download/${encodeURIComponent(setId)}/${Number(partId || 1)}`,
         { method: "GET" }
       );
       if (!response.ok) return "";
       const payload = await response.json().catch(() => ({}));
       return String(payload.transcript || "");
     }

     /**
      * Delete audio object and URL index entry.
      * @param {string} setId
      * @param {number} partId
      * @returns {Promise<boolean>}
      */
     async deleteAudioFromFirebase(setId, partId = 1) {
       if (!setId) return false;
       const storagePath = `toefl_itp/audio/${setId}/part_${partId}`;
       const encodedPath = encodeURIComponent(storagePath);
       let deleted = false;

       for (const base of this._getStorageBases()) {
         try {
           const res = await fetch(`${base}/${encodedPath}`, { method: "DELETE" });
           if (res.ok || res.status === 404) {
             deleted = true;
             break;
           }
         } catch {
           // Try next base alias
         }
       }

       try {
         await fetch(this._url(`toefl_itp/audio_urls/${setId}/part_${partId}`), { method: "DELETE" });
       } catch {
         // Ignore URL index delete failure in best-effort cleanup
       }

       return deleted;
     }

     // â”€â”€â”€ DATA RECOVERY & ARCHIVE MANAGEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

     async getArchivedItems(testType = "mocktest") {
       const archivePath = `toefl_itp/archive/${testType}/sets`;
       try {
         const data = await this._get(archivePath);
         if (!data || typeof data !== "object" || Array.isArray(data)) {
           return [];
         }
         const items = Object.entries(data)
           .filter(([key]) => key !== "_updatedAt")
           .map(([setId, value]) => ({
             setId,
             ...value,
             _archived: true
           }))
           .sort((a, b) => {
             const timeA = new Date(a._archivedAt || 0).getTime();
             const timeB = new Date(b._archivedAt || 0).getTime();
             return timeB - timeA; // Most recent first
           });
         return items;
       } catch (e) {
         console.warn(`[ToeflSync] Failed to fetch archived items for ${testType}:`, e.message);
         return [];
       }
     }

     async restoreArchivedItem(setId, testType = "mocktest") {
       if (!setId) return false;
       try {
         const archivePath = `toefl_itp/archive/${testType}/sets/${setId}`;
         const archivedRecord = await this._get(archivePath);
      
         if (!archivedRecord) {
           console.warn(`[ToeflSync] Archived item not found: ${setId}`);
           return false;
         }

         // Remove archive markers
         const { _archived, _archivedAt, _archivedFrom, _archivedFromPath, ...restoredData } = archivedRecord;
         restoredData._restoredAt = new Date().toISOString();

         // Save back to active location
         const paths = this._getPathsForTestType(testType);
         const activeRecord = await this._get(`${paths.setsPath}/${setId}`).catch(() => null);
      
         // Only restore if it's not already there (prevent overwriting)
         if (!activeRecord) {
           await this._put(`${paths.setsPath}/${setId}`, restoredData);
           console.log(`[ToeflSync] âœ… ${setId} restored from archive`);
         }

         // Also restore draft if archived
         try {
           const archivedDraftPath = `toefl_itp/archive/${testType}/drafts/${setId}`;
           const archivedDraft = await this._get(archivedDraftPath);
           if (archivedDraft) {
             const { _archived, _archivedAt, ...restoredDraft } = archivedDraft;
             await this._put(`${paths.draftsPath}/${setId}`, restoredDraft);
           }
         } catch {
           // No draft to restore, that's okay
         }

         this.isRemoteAvailable = true;
         return true;
       } catch (e) {
         this.isRemoteAvailable = false;
         console.error(`[ToeflSync] Failed to restore archived item ${setId}:`, e.message);
         return false;
       }
     }

     async permanentlyDeleteArchived(setId, testType = "mocktest") {
       if (!setId) return false;
       try {
         const archivePath = `toefl_itp/archive/${testType}/sets/${setId}`;
         const archiveDraftPath = `toefl_itp/archive/${testType}/drafts/${setId}`;
      
         // Hard delete from archive (irreversible)
         const [setRes, draftRes] = await Promise.all([
           fetch(this._url(archivePath), { method: "DELETE" }).catch(() => ({ ok: false })),
           fetch(this._url(archiveDraftPath), { method: "DELETE" }).catch(() => ({ ok: false }))
         ]);
      
         console.log(`[ToeflSync] âš ï¸ Permanently deleted ${setId} from archive (IRREVERSIBLE)`);
         this.isRemoteAvailable = true;
         return true;
       } catch (e) {
         this.isRemoteAvailable = false;
         console.error(`[ToeflSync] Failed to permanently delete ${setId}:`, e.message);
         return false;
       }
     }
   }

   window.toeflStorage = window.toeflStorage || new ToeflStorageSync();
