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
const TOEFL_STORAGE_BUCKET = "quickcheck-25590.firebasestorage.app";
const TOEFL_STORAGE_BASE = `https://firebasestorage.googleapis.com/v0/b/${TOEFL_STORAGE_BUCKET}/o`;

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
    this._lastStorageError = "";
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
      const [setRes, draftRes] = await Promise.all([
        fetch(this._url(`${this._setsV2Path}/${setId}`), { method: "DELETE" }),
        fetch(this._url(`${this._draftsV2Path}/${setId}`), { method: "DELETE" })
      ]);
      const setDeleteOk = setRes.ok || setRes.status === 404;
      const draftDeleteOk = draftRes.ok || draftRes.status === 404;
      if (!setDeleteOk || !draftDeleteOk) {
        throw new Error(`Delete failed (set:${setRes.status}, draft:${draftRes.status})`);
      }
      this.isRemoteAvailable = true;
    } catch (e) {
      this.isRemoteAvailable = false;
      console.warn(`[ToeflSync] Offline – ${setId} delete queued locally only:`, e.message);
      throw e;
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
      console.warn(`[ToeflSync] Offline – ${module} delete queued locally only:`, e.message);
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

  // ─── AUDIO FILES (Firebase Storage + RTDB URL index) ──────────────────────

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

    const extension = this._guessAudioExtension(audioBlob.name || "", audioBlob.type || "");
    const storagePath = `toefl_itp/audio/${setId}/part_${partId}.${extension}`;
    const uploadNameQuery = new URLSearchParams({ name: storagePath }).toString();
    const errors = [];

    for (const base of this._getStorageBases()) {
      try {
        const res = await fetch(`${base}?uploadType=media&${uploadNameQuery}`, {
          method: "POST",
          headers: { "Content-Type": audioBlob.type || "audio/mpeg" },
          body: audioBlob
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
          candidateUrls,
          fileName: audioBlob.name || `audio_part${partId}`,
          size: Number(audioBlob.size || 0),
          type: audioBlob.type || "audio/mpeg",
          uploadedAt: new Date().toISOString()
        });

        this.isRemoteAvailable = true;
        this._lastStorageError = "";
        console.log("[ToeflSync] Audio uploaded to Storage:", { setId, partId, size: audioBlob.size, base });
        return true;
      } catch (e) {
        errors.push(`${base} -> ${e?.message || String(e)}`);
      }
    }

    this.isRemoteAvailable = false;
    this._lastStorageError = errors.join(" | ");
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
    const storagePath = String(record?.storagePath || "").trim();
    const storedCandidates = Array.isArray(record?.candidateUrls) ? record.candidateUrls : [];
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
    const host = localStorage.getItem("toefl_storage_server_host") || "127.0.0.1";
    const port = localStorage.getItem("toefl_storage_server_port") || "8788";
    return `http://${host}:${port}`;
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
}

window.toeflStorage = window.toeflStorage || new ToeflStorageSync();
