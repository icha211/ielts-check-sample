# Logic for upload audio from website

This document describes the prototype where the website itself uploads listening audio directly into Cloudflare, instead of requiring a separate manual upload step in Cloudflare.

## Goal
- Let the developer upload Part 1, Part 2, and Part 3 from the website UI
- Create or reuse the correct Cloudflare folder for the test package
- Save the returned audio URL to Firebase per part for playback resolution
- Keep playback stable for `section 1.html` and `section 1_answered.html`

## UI location
The three upload boxes in `section 1.html` are the developer upload entry point:
- Part A Audio
- Part B Audio
- Part C Audio

Each box maps to one listening part.

## Flow
1. Developer creates a test package and fills in date and metadata.
2. Frontend generates `setId` via `ensureCurrentSetId()`.
3. Frontend calls `saveCloudAudioFolderUrlForCurrentSet()` to:
   - Call `/api/developer/ensure-audio-folder` backend endpoint
   - Receive `folderUrl` from Cloudflare
   - Save folder URL to Firebase draft at `cloudflare_folder`
   - Save to local draft for UI state
4. For each part (1, 2, 3), developer selects an MP3 file:
   - `handleAudioUpload(event, partNumber)` triggers on file selection
   - Calls `/api/developer/upload-url` to get signed PUT URL
   - **Direct PUT**: Sends file bytes directly to Cloudflare R2 via signed URL
   - **Fallback**: If direct PUT fails (CORS), uses `/api/developer/upload-proxy` for server-side upload
   - Saves returned `objectUrl` to Firebase at `toefl_itp/audio_urls/{setId}/part_N`
   - Also saves to local draft at `draft.parts[N].audio_cloudflare` for offline access
5. Developer clicks "Validate 3 audio" to confirm all parts have URLs
   - Checks both local draft and Firebase audio_urls path
   - Shows ✓ for uploaded parts, ✗ for missing parts
6. `section 1.html` and `section 1_answered.html` resolve audio URLs:
   - Call `getCloudAudioUrlWithTimeout(setId, partId)`
   - Reads from Firebase audio_urls via `getPlayableAudioFromFirebase()`
   - Returns Cloudflare R2 URL for playback

## Storage locations

### Firebase Realtime Database paths:
- `toefl_itp/audio_urls/{setId}/part_1` → `{ url, objectKey, candidateUrls, ... }`
- `toefl_itp/audio_urls/{setId}/part_2` → `{ url, objectKey, candidateUrls, ... }`
- `toefl_itp/audio_urls/{setId}/part_3` → `{ url, objectKey, candidateUrls, ... }`
- `toefl_itp/mocktest/drafts_v2/{setId}` → `{ cloudflare_folder, parts[N].audio_cloudflare, ... }`

### Cloudflare R2:
- `audio/listening/sets/{setId}/part_1.mp3` → Audio file bytes
- `audio/listening/sets/{setId}/part_2.mp3` → Audio file bytes
- `audio/listening/sets/{setId}/part_3.mp3` → Audio file bytes
- `audio/listening/sets/{setId}/.folder` → Folder marker (created by ensure-audio-folder)

### Browser localStorage (fallback only, not primary storage):
- `toefl_developer_mocktest_drafts_v2` → Local draft copy for offline access

## Why this works globally
- **Cloudflare stores the media**: Public URLs serve audio consistently worldwide
- **Firebase stores only references**: `toefl_itp/audio_urls/{setId}/part_N` contains the Cloudflare R2 URL
- **Every device fetches the same URL**: Same setId → same Firebase record → same Cloudflare R2 URL
- **Playback resolution is automatic**: Answered page calls `getPlayableAudioFromFirebase()` which returns the saved Cloudflare URL
- **Multi-device access works**: Any device accessing a setId retrieves URLs from Firebase, then plays audio from Cloudflare

## Validation role
Validation still matters:
- it confirms the 3 uploaded files have URLs in Firebase
- it catches incomplete uploads before saving
- it checks both local draft and Firebase as fallback
- it prevents saving a test package with missing audio

## Upload flow with error handling
1. **Direct PUT to R2**: 
   - Browser sends file directly to signed URL
   - Works in modern browsers, no server load
   
2. **Fallback to Proxy**:
   - If direct PUT fails (CORS policy, network issues)
   - Backend proxy endpoint handles multipart form upload
   - Server streams bytes to R2
   - Returns same `objectUrl`

3. **Firebase write (non-blocking)**:
   - Save to `toefl_itp/audio_urls/{setId}/part_N` always attempted
   - If Firebase offline, local draft still updates
   - Next page load will sync with Firebase
   - Ensures playback works even if Firebase was briefly unreachable

## Result
The website acts as the upload tool, Cloudflare remains the storage layer, and Firebase remains the reference/index layer. Developers can upload audio from any browser on any network globally, and any other device will automatically access the same content via the shared Firebase index.