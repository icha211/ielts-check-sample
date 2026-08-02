# Logic for upload audio from website

This document describes the prototype where the website itself uploads listening audio directly into Cloudflare, instead of requiring a separate manual upload step in Cloudflare.

## Goal
- Let the developer upload Part 1, Part 2, and Part 3 from the website UI
- Create or reuse the correct Cloudflare folder for the test package
- Save the returned audio URL to Firebase per part
- Keep playback stable for `section 1.html` and `section 1_answered.html`

## UI location
The three upload boxes in `section 1.html` are the developer upload entry point:
- Part A Audio
- Part B Audio
- Part C Audio

Each box maps to one listening part.

## Flow
1. Developer creates a test package and fills in date and metadata.
2. Frontend generates `setId`.
3. Frontend builds the Cloudflare folder path:
   - `{cloudflarePublicBase}/audio/listening/sets/{setId}`
4. Frontend calls `ensure-audio-folder`.
5. Frontend saves folder metadata to Firebase draft + date index.
6. For each part:
   - build the exact `objectKey` from `setId` and part number
   - call `upload-url` to get a signed PUT URL
   - upload the MP3 bytes to that signed URL
   - save the returned `objectUrl` to Firebase at `parts/{n}/audio_cloudflare`
7. `section 1.html` and `section 1_answered.html` resolve the set by `setId` or date and use the saved part URLs for playback.

## Why this works globally
- Cloudflare stores the media in a public location
- Firebase stores only the reference URL
- every device loads the same URL
- playback comes from Cloudflare, so the audio stays consistent across networks

## Validation role
Validation still matters:
- it confirms the 3 uploaded files are present
- it can repopulate missing part URLs
- it prevents saving an incomplete draft

## Result
The website can act as the upload tool, while Cloudflare remains the storage layer and Firebase remains the reference layer.