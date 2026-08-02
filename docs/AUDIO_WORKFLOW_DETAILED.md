# Audio workflow reference

This document explains how listening audio moves from the developer upload flow to Firebase storage and then to user playback.
It also covers the newer in-browser upload option, where the website uploads directly into the created Cloudflare folder.

## Files covered
- `section 1.html`
- `section 1_answered.html`
- `developer.js`

## 1) High-level flow
1. Developer creates a test package and the frontend generates a `setId`.
2. Frontend creates or links the Cloudflare folder for that set.
3. Audio is uploaded either:
   - through the website upload boxes, or
   - through the Cloudflare workflow directly, if needed.
4. Cloudflare returns a public object URL for each part.
5. Frontend stores that URL per part in Firebase RTDB.
6. User-facing pages read the same URL from Firebase and play the audio globally.

## 2) Developer upload flow (`section 1.html`)
### Purpose
This file handles:
- selecting the audio file
- validating the part structure
- uploading audio
- saving the resulting Cloudflare URL
- persisting the draft to Firebase

### Core idea
Each listening test has 3 parts. Each part should end up with exactly one public audio URL.

### Upload sequence
1. Developer creates the package metadata and the frontend generates the `setId`.
2. The UI builds the Cloudflare folder path for the set.
3. The developer uploads Part A, Part B, and Part C from the three upload boxes.
4. For each part, the frontend requests a signed upload URL.
5. The browser uploads the MP3 bytes directly to Cloudflare.
6. Cloudflare returns the public object URL.
7. The frontend stores that URL for the matching part.
8. When the draft is saved, the part URL is written to Firebase.

### Important detail
The in-memory part map must be updated before saving. If the map is empty, Firebase will receive empty values even if upload already succeeded.

### Direct website upload option
The website upload boxes are the preferred path for the prototype:
- the developer selects the file on the page
- the page uploads directly to the designated Cloudflare folder
- the resulting `audio_cloudflare` value is saved per part

This makes Cloudflare a storage target, not a separate manual upload step.

## 3) Developer validation flow (`section 1.html`)
### Purpose
Validation checks whether the Cloudflare folder contains the required 3 audio files.

### Validation sequence
1. Developer triggers validation.
2. Frontend calls the API that lists folder contents.
3. API returns the discovered audio files and their URLs.
4. Frontend maps each file to its part.
5. URLs are copied into the current part state.
6. Developer can then save the draft.

### Why this matters
Validation is not just a check. It also repopulates the part URL state so the saved draft stays consistent.

## 4) Folder and object model
### Cloudflare folder
The folder is derived from the test package:
- `{cloudflarePublicBase}/audio/listening/sets/{setId}`

### Per-part object keys
Each upload gets a stable object key based on:
- `setId`
- part number

This keeps the stored URL predictable and makes playback retrieval deterministic.

## 5) User playback flow (`section 1_answered.html`)
### Purpose
This file is what learners use to hear the audio.

### Playback sequence
1. User opens a listening set.
2. The page requests the saved Cloudflare URL for the selected part.
3. Firebase returns the stored URL.
4. The audio element is pointed at that URL.
5. The browser streams audio directly from Cloudflare.

### Result
Any user, on any device, on any network, can play the same audio as long as the URL is publicly reachable.

## 6) `developer.js`
### Purpose
This file manages test-set metadata and navigation for developer workflows.

### Responsibilities
- organizes test-set information
- keeps the listening set structure consistent
- links into the section editor pages

### What it does not do
It does not store audio itself. It only helps manage the test-set lifecycle and editor entry points.

## 7) Storage model
### Cloudflare
- stores the actual audio file
- serves a public CDN URL
- is the source of truth for playback media

### Firebase RTDB
- stores references to the Cloudflare URLs
- keeps test data readable by frontend pages
- does not need to hold the raw audio file

## 8) Global consistency model
The system is globally consistent because:
- the same public Cloudflare URL is reused
- Firebase stores the URL once per part
- every client loads the same reference
- playback happens from Cloudflare CDN, not from a local device

## 9) API and backend role
### Backend
The backend is responsible for:
- receiving uploaded audio
- saving to Cloudflare R2
- returning a public URL

### Frontend API calls
The frontend is responsible for:
- requesting signed upload URLs
- uploading bytes to Cloudflare
- requesting folder contents for validation
- saving the discovered URLs into part state
- persisting the draft to Firebase

## 10) Common failure points
- URL saved after draft persistence instead of before
- validation finds files but does not write them into the part map
- a part is missing an audio file
- Firebase stores an empty string instead of a real Cloudflare URL

## 11) Summary
The workflow is:
developer upload -> Cloudflare R2 -> public CDN URL -> Firebase RTDB reference -> user playback.

If the URL is saved correctly for each part, the audio will play consistently for all users globally.
