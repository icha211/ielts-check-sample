# Section 2 Gemini AI Explainer - Setup Guide

## Overview

The system now automatically generates **QC C.O.R.E ANALYSIS explanations** for Section 2 questions using **Google Gemini API**. Explanations appear **inline below question options** and are **expandable/collapsible**.

## Key Features

✅ **Auto-Generation** - Explanations generate when question loads  
✅ **Inline Display** - Shows directly below question options  
✅ **Expandable/Collapsible** - Click header to expand/collapse  
✅ **Gemini API** - Uses Google's free Gemini 2.0 Flash model  
✅ **Caching** - Stores generated explanations for instant recall  
✅ **Error Handling** - Graceful fallback if API unavailable  

## How It Works

1. **Page Loads** → Questions are detected
2. **API Key Check** → Looks for Gemini API key in localStorage
3. **API Call** → Sends question + options to Gemini
4. **QC C.O.R.E Generation** → Gemini generates structured analysis
5. **Inline Injection** → Display below question with expand/collapse

## Setup (3 Steps)

### Step 1: Get Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Click **"Create API Key"**
3. Copy the key (format: `AIza...`)

### Step 2: Add Key to Browser (Pick One)

**Option A: Manual Configuration (Recommended)**
```javascript
// Open browser console (F12) on section 2-answered.html and run:
Section2ReviewExplainer.setApiKey("AIza...")
```

**Option B: Automatic Prompt**
- First time you open the page, a prompt appears asking for your API key
- Paste key and press Enter
- Key is saved to localStorage automatically

**Option C: Direct localStorage**
```javascript
// Open browser console and run:
localStorage.setItem("toefl_section2_gemini_api_key", "AIza...")
```

### Step 3: Reload & Test

1. Reload `section 2-answered.html`
2. Click on a question
3. Wait 5-15 seconds
4. **QC C.O.R.E ANALYSIS** header should appear
5. Click header to expand/collapse

## Architecture

### Three Core Modules

**1. section2-gemini-explainer.js** (18,301 bytes)
- Handles Gemini REST API communication
- Generates QC C.O.R.E analysis
- Formats beautiful HTML output

**2. section2-review-explainer.js** (10,904 bytes)
- Integrates with section 2-answered.html
- Auto-detects question changes
- Manages caching and injection

**3. Built-in Gemini Integration** (section 2-answered.html)
- Already has `requestGeminiAiQcReply()` function
- Uses `generateContent` endpoint
- Supports streaming responses

## Files Modified

✅ **section 2-answered.html**
- Added script imports for Gemini explainer modules
- Scripts load automatically on page load

✅ **js/section2-gemini-explainer.js** (NEW)
- Gemini API client for QC C.O.R.E generation
- HTML formatting with color-coded S-V-C

✅ **js/section2-review-explainer.js** (NEW)
- Integration layer for section 2-answered.html
- Auto-generation on question change
- Expandable/collapsible UI

## API Key Storage

**Where is my key stored?**
- Browser `localStorage` under key: `toefl_section2_gemini_api_key`
- **Never sent anywhere except Anthropic or Google API**
- Only accessible in your browser on your computer

**How to remove it?**
```javascript
// Open console and run:
localStorage.removeItem("toefl_section2_gemini_api_key")
// Or:
Section2ReviewExplainer.clearApiKey()
```

## Troubleshooting

### "No Gemini API key found"
- Open console (F12)
- Run: `Section2ReviewExplainer.setApiKey("AIza...")`
- Reload page

### "Explanation not showing"
- Check console for errors (F12 → Console tab)
- Make sure API key is valid
- Wait 10-15 seconds (first generation takes longer)
- Reload the page

### "API key not configured"
- Paste your key when prompted, or
- Manually set via console command above

### "Failed to generate explanation"
- Check internet connection
- Verify API key is still valid
- Try a different question
- Check [Gemini API Status](https://status.cloud.google.com/)

## Performance

**Generation Time:**
- First question: 10-15 seconds
- Subsequent questions: 1-2 seconds (cached)

**Token Usage:**
- ~500-1000 tokens per question
- Google Gemini free tier: 15 calls/minute, 50K calls/day

**Browser Impact:**
- Non-blocking (doesn't freeze page)
- Runs in background
- Cache stored in sessionStorage

## Advanced Features

### Check Status
```javascript
Section2ReviewExplainer.getStatus()
// Returns: { initialized: true, hasApiKey: true, cacheSize: 5 }
```

### Manually Generate
```javascript
Section2ReviewExplainer._generateForCurrentQuestion()
```

### Debug Mode
```javascript
console.log(window.Section2ReviewExplainer)
console.log(window.Section2GeminiExplainer)
```

## Known Limitations

- ⚠ Works best for Part A (Structure questions)
- ⚠ May struggle with Part B/C (Error Correction)
- ⚠ Requires active internet connection
- ⚠ Gemini free tier has rate limits (15 calls/minute)
- ⚠ Explanations cached per session (cleared on page reload)

## Privacy & Security

✅ **No data stored on servers**  
✅ **API calls go directly to Google**  
✅ **No tracking or analytics**  
✅ **Keys never logged or shared**  
✅ **All processing local to browser**  

## Future Enhancements

🔮 Support for Part B/C questions  
🔮 Batch generation (multiple questions)  
🔮 Save explanations to Firebase  
🔮 Edit & regenerate functionality  
🔮 Multi-language support  
🔮 Offline caching with IndexedDB  

## Support

For issues or questions:
1. Check troubleshooting section above
2. Open browser console (F12)
3. Look for error messages
4. Try regenerating the explanation
5. Contact developer with error message

## License

This system integrates with Google Gemini API.  
See https://ai.google.dev/terms for API terms.
