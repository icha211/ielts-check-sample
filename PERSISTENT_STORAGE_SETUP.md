# 🗄️ Persistent Data Storage Setup Guide

## Overview

Your IELTS Check application now has **persistent data storage**! This means:
- ✅ Questions you create in the Developer Console will be saved permanently
- ✅ Data persists across browser sessions and refreshes  
- ✅ Works seamlessly with the AI Review feature
- ✅ Automatic fallback to browser localStorage if server is unavailable

---

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
pip install -r requirements.txt
```

This installs:
- `google-genai>=0.8.0` (for AI Review feature)

### Step 2: Start Both Services

You need to run **TWO** servers in separate terminals:

#### Terminal 1 - Persistent Storage Server

```bash
python data_storage_server.py
```

Expected output:
```
🗄️  Data Storage Server started at http://127.0.0.1:8788
📁 Data directory: C:\Users\icha\ielts-check-sample\data
Press Ctrl+C to stop...
```

#### Terminal 2 - AI Review Server

```bash
set GEMINI_API_KEY=your_actual_api_key_here
python ai_review_server.py
```

Expected output:
```
🤖 AI Review Server started at http://127.0.0.1:8787
Press Ctrl+C to stop...
```

### Step 3: Verify It's Working

1. Open [http://localhost/developer.html](http://localhost/developer.html) in your browser
2. Create a new Reading problem set
3. **Refresh the page** - your problem should still be there ✅
4. Close the browser and reopen it - data persists ✅

---

## 📁 Data Storage

All data is stored in a `data/` directory in your project:

```
project-root/
├── data/
│   ├── problems.json          # All problem sets (Reading, Listening, Writing, Speaking)
│   ├── daily_tests.json       # Daily test completion records
│   ├── test_results.json      # AI review results and test scores
│   ├── data_storage_server.py # Storage service
│   └── ai_review_server.py    # AI Review service
```

### Backup Your Data

The `data/problems.json` file contains all your created questions. **Back it up regularly!**

```bash
# Backup example
copy data\problems.json data\problems_backup_$(date +%Y%m%d_%H%M%S).json
```

---

## 🔧 Server Configuration

### Data Storage Server

**Port**: 8788 (configurable via `STORAGE_PORT` environment variable)

**Endpoints**:
- `GET /api/problems` - Get all problems
- `GET /api/problems/{module}` - Get problems by module (reading, listening, writing, speaking)
- `POST /api/problems` - Add/save problems
- `PUT /api/problems` - Update a problem
- `DELETE /api/problems` - Delete a problem
- `GET /api/daily-tests` - Get daily test records
- `POST /api/daily-tests` - Record daily test completion
- `GET /api/test-results` - Get all test results
- `POST /api/test-results` - Save test result

**Environment Variables**:
```bash
STORAGE_PORT=8788          # Port to listen on (default: 8788)
STORAGE_HOST=127.0.0.1     # Host to bind to (default: 127.0.0.1)
```

### AI Review Server

**Port**: 8787 (configurable via `AI_REVIEW_PORT` environment variable)

**Required Environment Variable**:
```bash
GEMINI_API_KEY=your_api_key_here
```

**Optional Environment Variables**:
```bash
GEMINI_MODEL=gemini-3-flash-preview     # Model to use (default shown)
AI_REVIEW_PORT=8787                     # Port to listen on
```

---

## 🛠️ Architecture

### Frontend (Browser)
- Includes `storage-sync.js` helper library
- Automatically detects if storage server is available
- Syncs data to both server AND localStorage (for redundancy)
- If server unavailable, falls back to localStorage

### Backend (Python)
- **data_storage_server.py**: HTTP service that reads/writes to JSON files
- **ai_review_server.py**: HTTP service that calls Gemini API for reviews
- Both run independently and can be started/stopped without affecting the other

### Data Flow

```
Browser (Front-end)
    ↓
storage-sync.js (helper library)
    ↓
    ├→ data_storage_server.py (8788)
    │       ↓
    │    data/problems.json
    │
    └→ localStorage (fallback)
```

---

## 📝 How to Use

### Creating Questions (Developer)

1. Go to **Developer Dashboard**
2. Click **"Create Reading/Listening/Writing/Speaking"**
3. Fill in the form and click **Save**
4. Data is automatically:
   - Saved to the persistent server
   - Synced to browser localStorage
   - Stored in `data/problems.json`

### Taking Tests (Student)

1. Go to any test page (reading-test.html, etc.)
2. Test loads your saved questions from persistent storage
3. Submit answers
4. AI Review appears at the bottom (if enabled)
5. Test results saved automatically

---

## 🔒 Security Notes

- **API Keys**: The Gemini API key is **ONLY** stored on your local machine as an environment variable
- **Local Python storage**: Its data files remain on your machine, and the services listen on `127.0.0.1` by default
- **Firebase features**: TOEFL account profiles and the opt-in study-partner directory use Firebase Realtime Database

---

## Live TOEFL study-partner directory

Signed-in learners are automatically listed with their name, available country, CEFR level and photo. The dashboard's **Show my name, country, level and photo** checkbox lets them hide their profile; this stores `users/{uid}/partnerDirectoryHidden: true`. The older opt-in field is no longer the visibility setting. Email addresses and phone numbers are not copied into the directory. Missing photos use initials, and country badges are shown only when the profile has a known country.

The shared navigation starts `toefl-sample/js/partner-directory.js` on TOEFL pages. It subscribes to the account profile and updates `partnerDirectory/{uid}`. Connection status uses `partnerDirectory/{uid}/presence/{connectionId}` with Firebase `onDisconnect` cleanup and a separate connection for each tab/device. The carousel prioritizes online learners, excludes the viewer's own profile, and updates in real time. Hiding a profile removes it from the directory. Existing accounts appear when they next open an updated TOEFL page; this does not backfill all Firebase Auth accounts.

`database.rules.json` restricts profile and presence writes to the signed-in account that owns each UID; only authenticated users can read the directory. Deploy the rules with:

```bash
firebase deploy --only database
```

## TOEFL test history

Completed listening, structure, and reading attempts are stored under `user_test_history/{uid}` in Realtime Database. The Firebase Authentication UID owns the records, and the database rules allow only that signed-in account to read or write them. Attempt records include the score, test mode, selected set, answers, question text, and available explanations. Passwords are handled only by Firebase Authentication and are never included in these records. Signed-out attempts remain local to the browser and are not automatically imported into any account. Only pending attempts already scoped to the signed-in UID are retried. Deploy `database.rules.json` with `firebase deploy --only database` to enable account history writes.

New full mock tests carry a `mockSessionId` through all three section URLs. Section records use a stable session-and-section ID to avoid duplicate submissions. History groups them into one mock test and marks it completed only when all three sections have results. Standalone mock sections and older records without a session ID remain section results, not full mock-test attempts; older records are not guessed into sessions or deleted. Practice attempts and the section-level data used by progress/recommendations remain separate. View Result restores only the selected entry's saved answers; older summary-only records show that details are unavailable rather than opening unrelated browser results.

## Realtime TOEFL messages

The Messages page uses Firebase Authentication and Realtime Database, not demo conversations or browser-local message storage. New message recipients come from the signed-in learner directory. Photos and online status update with the directory; accounts without photos use initials.

### Message requests

Learners must accept a message request before either side can send messages:

1. The requester chooses **Send request** (dashboard partner card or Messages page). One atomic write stores `message_contacts/{requesterUid}/{recipientUid}` with `status: "outgoing"` and `message_contacts/{recipientUid}/{requesterUid}` with `status: "incoming"`. The recipient must be listed in the learner directory, and no request may already exist in either direction.
2. The recipient sees the request in their inbox and the sidebar Message badge. Only the recipient can **Accept**, which atomically sets both sides to `connected`.
3. Either learner can decline or cancel a pending request. This deletes both sides together.

Rules allow each learner to read only their own `message_contacts/{uid}`. They also reject one-sided writes, self-requests, accepts by the requester, status rollbacks, client timestamps and extra fields. Message creation requires the sender's own contact status to be `connected`.

Both contact records also store `requesterId`, the UID of the learner who sent the request. Rules require it to match the requester when the request is created and keep it unchanged when it is accepted, so nobody can forge who asked first.

### Calendar activity visibility

The info button beside **MONTHLY STUDY PLAN** opens the Calendar Guide: practice section illustrations, status/color meanings, and the three-step study flow. The guide uses a native light-dismiss popover above clipped calendar containers. Click outside, click the info button again, or press Escape to close it. It stays within the viewport and scrolls internally on shorter screens.

The dashboard calendar initially shows the three section icons only on days 1–4 of each month. Later dates retain their dates, mock-test labels/colors, and navigation, but no section icons. A completed `full-mock` history entry (all three sections in the same mock session) reveals the three calendar days after its scheduled `setDate`, using its submission date when no scheduled date exists. Partial mocks and standalone section results do not unlock days. Unlocks accumulate, can cross month/year boundaries, and refresh with account-scoped history updates. Adjacent-month placeholder cells never show section icons. This is a display rule, not an access restriction on tests.

### Accepted-request notifications

Message threads group messages by the viewer's local calendar day, with centered separators: Today, Yesterday, weekday names for two through six days ago, and a full date for seven or more days ago. Labels refresh every minute and on returning to the tab without rebuilding the conversation or changing its scroll position. Each bubble contains a compact time in its lower-right corner, with a full timestamp available on hover and a machine-readable `time` element. Multiline text and long words wrap without overlapping the time.

The dashboard's **Your global network** panel lists only the signed-in learner's accepted (`connected`) contacts that are available in the learner directory, whether online or offline. Its connection total, CEFR breakdown and top countries all use that same filtered list and refresh when profiles or contacts change. Pending requests, unrelated learners and the viewer are excluded. Matchmaking and its search include only other learners with at least one presence connection set to `true`. Presence changes refresh this pool live and clear a selection that goes offline; an empty pool explicitly says no other learners are online.

The matchmaking avatar carousel shows a window of at most five online learners, automatically looping that preview rightward along a five-position arc when at least two learners are available. The center avatar is largest; avatars shrink and sit lower toward either edge. Only these five avatars are mounted/animated, even for large directories; arrows and search reach the full online pool without duplicating learners in the preview. Hovering or focusing within the carousel temporarily pauses motion for selection; motion resumes when neither applies. There is no pause button. Reduced-motion preferences disable autoplay and show the static preview; the previous/next buttons remain available. Navigation uses two 44px arrow targets and a fixed-width position/total counter rather than one dot per profile, so controls do not grow with the number of online learners. Arrows wrap around, disable for a single learner, and hide with the counter for an empty pool. The counter describes the browsing start position, not the automatically moving center avatar.

The bell button in the shared top bar (`site-navbar.js`) shows a badge as soon as someone accepts a request you sent. It listens in realtime to `message_contacts/{uid}`, where an entry with `status: "connected"` and `requesterId` equal to your UID is an accepted request. Opening the bell lists the latest accepted requests and links each one to `message.html?to={peerUid}`. Opening it also writes `notification_state/{uid}/acceptedSeenAt` as a server timestamp, which clears the badge on every device. Only the owner can read or write `notification_state/{uid}`; the value must be a number no later than the server time, and no other fields are allowed. Contacts accepted before `requesterId` existed do not produce bell notifications.

Each send atomically creates the same message at `user_messages/{senderUid}/{recipientUid}/{messageId}` and `user_messages/{recipientUid}/{senderUid}/{messageId}` with a server timestamp. Rules permit only the authenticated sender to create messages with their own UID, and only each inbox owner can read that inbox. Messages are limited to 2,000 characters. Favorites, archived/deleted-folder flags and read timestamps are stored separately at `message_preferences/{uid}/{peerUid}` and can be accessed only by that account. Recently deleted hides the conversation for that user; it does not erase the other participant's messages.

The composer fills the available width with Send alongside it on desktop and mobile. Enter sends, Shift+Enter inserts a newline, and IME composition does not submit. Right-clicking an outgoing message or choosing its keyboard/touch-accessible actions button opens Edit/Delete. Editing is inline with Save/Cancel and preserves the draft on failure. Edits update both copies atomically with `editedAt` and an Edited label. Delete requires confirmation and replaces both copies with a `Message deleted` tombstone and `deletedAt`; deleted messages cannot be edited or restored. Rules preserve sender, recipient and original send time, reject recipient/third-party mutations, and require matching copies for creates, edits and deletions.

Outgoing double checks are gray for sent/unread and blue for read, with accessible labels and tooltips. A receipt means the recipient has opened the conversation in a visible, focused tab and reached its latest messages (not merely received them). On mobile the thread must also be on screen. The reader atomically advances their private read preference and `message_receipts/{senderUid}/{readerUid}/readAt`. Only the reader can advance that receipt; only the sender can read its containing inbox. Receipt values are monotonic and cannot exceed server time. Receipt updates are subscribed live, while folder flags stay private. Existing private read preferences are not backfilled into shared receipts. Scrolling older messages is preserved during live updates.

The page subscribes to messages, contacts, directory profiles and private folder/read state. The sidebar badge counts unread incoming messages plus pending incoming requests. Account changes detach listeners and clear the previous account's UI. Sending is confirmed only after Firebase acknowledges the atomic write; failures preserve the composed text. Offline writes may remain pending until reconnection. There are no attachments, group chats, automated replies, rate limiting or blocking controls in this direct-messaging implementation.

Deploy `database.rules.json` using `firebase deploy --only database --project quickcheck-25590` before using the updated website. Website assets must also be served from an updated deployment (or locally via the development site). Rules tests in `toefl-sample/messaging-rules.test.js` require the Realtime Database emulator and `FIREBASE_DATABASE_EMULATOR_HOST`; service tests run with `node --test toefl-sample/messaging.test.js`.

---

## 🐛 Troubleshooting

### "Server Unavailable" Message

**Problem**: You see "⚠️ Storage server unavailable. Using browser localStorage as fallback."

**Solution**:
1. Make sure `data_storage_server.py` is running in a terminal
2. Check the port: should be `http://127.0.0.1:8788`
3. If different port, set `STORAGE_PORT` environment variable

```bash
set STORAGE_PORT=9999
python data_storage_server.py
```

### Data Not Persisting

**Problem**: Questions disappear after browser refresh

**Solution**:
1. Check if `data_storage_server.py` is running
2. Verify `data/` directory exists and is writable
3. Check browser console for errors (F12 → Console tab)
4. Try: `python data_storage_server.py` and create a new problem

### AI Review Not Working

**Problem**: AI review panel doesn't appear after test submission

**Solution**:
1. Make sure `ai_review_server.py` is running: `python ai_review_server.py`
2. Set Gemini API key: `set GEMINI_API_KEY=your_key`
3. Check browser console (F12) for error messages
4. Ensure `storage-sync.js` is loaded in test pages

---

## 📊 Monitoring Data

### View All Problems

```bash
# On Windows, you can view the JSON file:
type data\problems.json | more

# Or open in a text editor
start data\problems.json
```

### Export Data

The Developer Dashboard has an **Export** button that downloads all problems as JSON.

### Clear All Data

```bash
# WARNING: This deletes all your data!
del data\problems.json
del data\daily_tests.json
del data\test_results.json
```

---

## 🚨 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Connection refused" error | Storage server not running | Start `data_storage_server.py` |
| Data disappears on refresh | Both servers not running | Run both services in separate terminals |
| Port already in use | Another application using port 8788 | Change `STORAGE_PORT` or kill other process |
| "File not found" error | `data/` directory missing | Run storage server once to create it |
| AI reviews show errors | GEMINI_API_KEY not set | Set env var: `set GEMINI_API_KEY=key` |

---

## 📚 File Reference

| File | Purpose |
|------|---------|
| `data_storage_server.py` | Persistent storage HTTP service |
| `storage-sync.js` | Client-side helper for storage operations |
| `data/problems.json` | All problem sets database |
| `data/daily_tests.json` | Daily test completion log |
| `data/test_results.json` | AI review results log |

---

## 🎯 Next Steps

1. ✅ Run both servers
2. ✅ Create a test question in the Developer Console
3. ✅ Refresh the page - verify data persists
4. ✅ Take a test and submit answers
5. ✅ See AI review feedback appear

Congratulations! Your IELTS Check app now has persistent storage! 🎉

---

## 💬 Support

If you encounter issues:
1. Check the error message in the browser console (F12 → Console)
2. Review the server terminal output for error logs
3. Verify all required services are running
4. Check that ports 8787 and 8788 are available
