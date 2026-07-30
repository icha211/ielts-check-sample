# 🚀 Getting Your Cloudflare R2 Audio Upload Working

## Summary of Issues & Fixes

You have two main problems preventing audio upload:

### ❌ **Problem 1: API Gateway Server Not Running**
Your browser tries to connect to `http://localhost:8000/api/developer/upload-url`, but there's no server listening on that port.

**Error in Console:**
```
net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8000/api/developer/upload-url
```

### ❌ **Problem 2: Missing JavaScript Method**
The code calls `toeflStorage.upsertSetRecordWithType()` but this method wasn't defined.

**Error in Console:**
```
TypeError: toeflStorage.upsertSetRecordWithType is not a function
```

---

## ✅ Fixes Applied

### ✅ Fix #1: Added Missing Method
**File:** `toefl-sample/toefl-storage-sync.js`
- Added `upsertSetRecordWithType(record, testType)` method that saves set metadata with test type

### ✅ Fix #2: Updated Cache Busters
**All HTML files in `toefl-sample/`:**
- Updated script version from `v=20260730a` → `v=20260730h`
- This forces browsers to load the latest code (no stale cache)

---

## 🔧 Next Steps: Start the FastAPI Gateway

### **Step 1: Open Command Prompt and Start the Server**

```bash
cd C:\Users\icha\ielts-check-sample\apps\api-gateway
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

This will:
1. ✅ Install required Python packages (fastapi, uvicorn, boto3, etc.)
2. ✅ Start the FastAPI server on `http://127.0.0.1:8000`
3. ✅ Load R2 credentials from `.env`

**Expected Output:**
```
Starting API Gateway server on http://localhost:8000...
...
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Leave this terminal open while testing.

---

### **Step 2: Serve Your HTML from a Local Web Server (Not file://)**

**Issue:** Your HTML is loaded as `file:///C:/Users/icha/...` which sets `origin = 'null'`. Browsers block CORS requests from `null` origin.

**Solution:** Use Python's built-in HTTP server:

```bash
py -m venv .venv
>> .\.venv\Scripts\python -m pip install -r requirements.txt
>> .\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Open NEW command prompt, go to project root
cd C:\Users\icha\ielts-check-sample

# Start a simple HTTP server on port 8001
py -m http.server 8001
```

**Expected Output:**
```
Serving HTTP on 0.0.0.0 port 8001 (http://0.0.0.0:8001/) ...
```

---

### **Step 3: Test Audio Upload**

1. **Open browser** → `http://localhost:8001/toefl-sample/section%201.html?mode=dev` (note the URL changes from `file://` to `http://`)
2. **Click "Upload Audio"** (file input)
3. **Select MP3 or M4A file**
4. **Check browser console** for success:

```
✅ Successful Upload:
- Should see: "Cloud sync succeeded"
- File appears in Cloudflare R2 bucket `toefl-test-assets`
- Audio can play from other devices

❌ If Still Failing:
- Run diagnostic in console:
window.toeflStorage.getApiGatewayDebugInfo()
  → Shows which gateway URL was tried
window.toeflStorage.getLastStorageError()
  → Shows exact error message
```

---

## 📋 Troubleshooting Checklist

| Issue | Solution |
|-------|----------|
| `ERR_CONNECTION_REFUSED` on port 8000 | Start uvicorn in `apps/api-gateway` and keep it open |
| CORS error on R2 bucket | Serve HTML from `http://localhost:8001` NOT `file://` |
| `upsertSetRecordWithType is not a function` | Cache updated to `v=20260730h` - hard refresh browser (Ctrl+Shift+R) |
| R2 bucket still empty after upload | Check gateway server logs for presigned URL errors |
| Audio plays but doesn't sync to other devices | Check browser console: `window.toeflStorage.getLastStorageError()` |

---

## 🔐 Cloudflare R2 Credentials

Your `.env` is already configured:
```
R2_ACCOUNT_ID="3b625308535ff3275dac34f5392e8822"
R2_BUCKET_NAME="toefl-test-assets"
R2_ACCESS_KEY_ID="c25357e563d25f43b3514c11618ce0b8"
R2_SECRET_ACCESS_KEY="3b1fe070bacc0c3c56f6ad32a27ee8cc7c41fff6ea0ba2ad05320f18aefa03c4"
```

✅ These are loaded automatically by the FastAPI gateway server.

---

## 🎯 Expected Upload Flow

```
1. User selects audio file from HTML input
   ↓
2. Browser calls window.toeflStorage.saveAudioViaGateway()
   ↓
3. Uploads through http://localhost:8000/api/developer/upload-proxy (proxy-first)
   ↓
4. Gateway writes to Cloudflare R2 bucket
   ↓
5. Stores metadata in local storage + Firebase RTDB
   ↓
6. Audio is now accessible globally via Cloudflare CDN
   ↓
7. On playback, fetches signed URL from gateway to access audio securely
```

---

## 📞 Need Help?

**If something still doesn't work:**

1. **Check gateway console** (where you ran uvicorn):
   - Should show: `POST /api/developer/upload-url` requests
   - Look for errors like "R2 credentials invalid" or "bucket not found"

2. **Check browser console** (F12):
   - Run: `window.toeflStorage.getApiGatewayDebugInfo()`
   - Shows which gateway URLs are being tried
   - Run: `window.toeflStorage.getLastStorageError()` 
   - Shows the actual error from the last upload attempt

3. **Hard refresh** the browser page (Ctrl+Shift+R) to ensure latest code is loaded

---

## ✨ Summary

| Component | Status |
|-----------|--------|
| FastAPI gateway setup | ✅ Ready (`uvicorn main:app ...`) |
| R2 credentials | ✅ Configured in `.env` |
| Upload logic in JS | ✅ Fixed (new `upsertSetRecordWithType()` method) |
| Cache busters | ✅ Updated (`v=20260730h`) |
| Next: Start servers | ⏳ **YOUR TURN** |

---

**👉 Next Command:**
```bash
cd C:\Users\icha\ielts-check-sample\apps\api-gateway
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Then in another terminal:
```bash
cd C:\Users\icha\ielts-check-sample
py -m http.server 8001
```

Then open `http://localhost:8001/toefl-sample/section%201.html?mode=dev` and test upload! 🚀
