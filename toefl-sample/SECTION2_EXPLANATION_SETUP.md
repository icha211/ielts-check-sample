# Section 2 Part A - QC C.O.R.E ANALYSIS Explanation Generator

## Overview
This system provides **AI-powered automatic generation** of QC C.O.R.E ANALYSIS explanations for Section 2 Part A (Structure) questions.

## Architecture

### Three Core Modules

1. **section2-ai-explanation.js**
   - Handles Claude API communication
   - Uses the comprehensive prompt from `explaination-promp/section2-partA.md`
   - Generates structured JSON responses following QC C.O.R.E framework
   - Formats output as beautiful HTML

2. **section2-explanation-panel.js**
   - UI integration into developer dashboard
   - API key configuration modal
   - Generate button with loading state
   - Preview and storage functionality
   - Error handling and status feedback

3. **section2-explanation-generator.js** (Optional)
   - Backup template-based generation without API
   - Can be used if API is unavailable
   - Provides structured formatting

## Setup Instructions

### 1. Add Script Imports to developer.html

Add these lines in the `<head>` section of `developer.html`:

```html
<!-- Section 2 Explanation Generator -->
<script src="js/section2-ai-explanation.js"></script>
<script src="js/section2-explanation-panel.js"></script>
```

### 2. Get Claude API Key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Create an API key (you'll get something like `sk-ant-...`)
4. Keep it secure

### 3. Use in Developer Dashboard

1. Open the **Developer Dashboard**
2. Scroll down to find **"Section 2 Part A - Explanation Generator"** panel
3. Click **"Configure API Key"**
4. Paste your Claude API key and save
5. Click **"Generate Explanation"**
6. Paste the question data as JSON
7. Wait for AI to generate the explanation
8. Preview and copy the HTML

## Question Data Format

When prompted to generate, provide JSON like this:

```json
{
  "questionText": "The discovery of insulin _____ a major breakthrough in medical history.",
  "options": {
    "A": "represented",
    "B": "representing",
    "C": "is represented",
    "D": "has been represented"
  },
  "correctAnswer": "A",
  "context": "Optional: any additional context about why this question is tricky"
}
```

## Generated Output

The system generates:

```json
{
  "header": "Why (A)?",
  "concept": "Subject-Verb Agreement",
  "conceptIndonesian": "Keselarasan Subjek-Verba",
  "sentenceFormula": "SVC",
  "subjectComponent": "The discovery of insulin",
  "verbComponent": "represented",
  "complementComponent": "a major breakthrough in medical history",
  "requirement": "Explanation of what's needed...",
  "eliminate": {
    "A": "✓ (BENAR) - ...",
    "B": "✕ (SALAH) - ...",
    "C": "✕ (SALAH) - ...",
    "D": "✕ (SALAH) - ..."
  }
}
```

And formats it as beautiful HTML with:
- Color-coded S-V-C highlighting
- QC C.O.R.E sections with proper styling
- Option elimination analysis
- Indonesian translations

## Key Features

✅ **Fully Automatic** - No manual formatting needed  
✅ **QC C.O.R.E Compliant** - Follows your framework exactly  
✅ **Beautiful HTML** - Color-coded, well-structured output  
✅ **Non-Blocking** - Doesn't interfere with other developer tools  
✅ **Error Handling** - Graceful fallback if API unavailable  
✅ **Storage** - Saves drafts in sessionStorage  
✅ **Indonesian Support** - Translations included in explanations  

## Security

- API key stored in **localStorage** (not sent to any server except Anthropic)
- All API calls go directly to Anthropic (no intermediary)
- Key is masked in the UI after configuration

## Troubleshooting

### "API key not configured"
→ Click "Configure API Key" and paste your key from https://console.anthropic.com

### "Invalid API key format"
→ Make sure your key starts with `sk-ant-`

### "API request timed out"
→ Check your internet connection and try again. Claude API sometimes takes 15-30 seconds.

### "Failed to parse JSON response"
→ The AI response was in an unexpected format. Try rewording the question.

## How It Works Internally

1. Developer enters question + options + correct answer
2. Panel sends to Claude API with comprehensive system prompt
3. Claude analyzes the question using QC C.O.R.E framework
4. Claude returns structured JSON with analysis
5. System converts JSON to beautiful HTML
6. Developer sees preview and can copy/modify

## Customization

You can modify the system prompt by editing:
`explaination-promp/section2-partA.md`

Changes will automatically apply on the next generation.

## Future Enhancements

- Batch generation (multiple questions at once)
- Direct storage to Firebase (auto-save to drafts)
- Edit & regenerate functionality
- Translation to other languages
- Caching frequently generated explanations
- Integration with section 2 editor for real-time generation
