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
- **Data**: All data files are stored locally on your machine
- **Network**: By default, all services listen only on `127.0.0.1` (localhost)
- **No Cloud**: Your data never leaves your computer (unless you explicitly deploy)

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
