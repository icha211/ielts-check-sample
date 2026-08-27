# Audio Review Sync Implementation Guide

This guide implements the requested four pieces:

1. Smart parser utility
2. Alignment integration (Deepgram + WhisperX fallback)
3. Schema blueprint
4. Interactive synced transcript player

## Files Added

- Frontend/client parser:
  - `toefl-sample/js/audio-sync/parser.js`
- Node alignment bridge:
  - `toefl-sample/js/audio-sync/aligner.js`
- Python WhisperX fallback:
  - `toefl-sample/js/audio-sync/whisperx_aligner.py`
- API utility + data shaping:
  - `apps/api-gateway/services/audio_review_pipeline.py`
- JSON schema blueprint:
  - `apps/api-gateway/services/audio_review_schema.json`
- Interactive review player:
  - `toefl-sample/js/audio-sync/review-audio-player.js`
  - `toefl-sample/js/audio-sync/review-audio-player.css`

## 1) Parser Usage

### Browser

```html
<script src="./js/audio-sync/parser.js"></script>
<script>
  const parsed = window.smartInputParser.parseSmartInput(rawSmartPasteText);
  console.log(parsed.questions);
</script>
```

### Node

```js
const { parseSmartInput } = require("./toefl-sample/js/audio-sync/parser.js");
const parsed = parseSmartInput(rawText);
```

## 2) Alignment Usage

### Deepgram path

Install dependency:

```bash
npm install @deepgram/sdk
```

Run:

```js
const { alignWithDeepgram } = require("./toefl-sample/js/audio-sync/aligner.js");

const aligned = await alignWithDeepgram({
  audioUrl: "https://cdn.example.com/listening/test.mp3",
  parsedQuestions: parsed.questions,
  deepgramApiKey: process.env.DEEPGRAM_API_KEY
});
```

### WhisperX fallback

Install Python dependency in your environment:

```bash
pip install whisperx
```

Run:

```js
const { alignWithWhisperXScript } = require("./toefl-sample/js/audio-sync/aligner.js");

const aligned = await alignWithWhisperXScript({
  audioUrl: "https://cdn.example.com/listening/test.mp3",
  parsedQuestions: parsed.questions,
  pythonCommand: "python"
});
```

## 3) Persisting the Data (Schema)

Schema reference:

- `apps/api-gateway/services/audio_review_schema.json`

Data structure:

```json
{
  "test_id": "listening_part1_set_001",
  "set_id": "practicetest_listening_xxxx",
  "question_data": [
    {
      "question_number": 1,
      "options": ["(A)...", "(B)...", "(C)...", "(D)..."],
      "transcripts": [
        {
          "speaker": "Man",
          "text": "...",
          "start": 12.231,
          "end": 16.009
        }
      ]
    }
  ]
}
```

Python builder helper:

- `apps/api-gateway/services/audio_review_pipeline.py`
  - `parse_smart_input(raw_text)`
  - `build_audio_review_payload(test_id, set_id, aligned_questions)`

## 4) Interactive Player Wiring

### HTML skeleton

```html
<link rel="stylesheet" href="./js/audio-sync/review-audio-player.css" />
<audio id="reviewAudio" controls src="https://cdn.example.com/file.mp3"></audio>
<div id="transcriptList" class="review-transcript-list"></div>

<script src="./js/audio-sync/review-audio-player.js"></script>
<script>
  const player = new window.ReviewAudioPlayer({
    audioSelector: "#reviewAudio",
    transcriptContainerSelector: "#transcriptList",
    data: questionData
  });
  player.render();
</script>
```

### Behavior delivered

- Click any transcript card to jump and play that segment.
- Active card highlights while audio plays.
- Playback auto-pauses when segment `end` is reached.
- Manual scrub updates active card state.

## Suggested Integration Point in Existing Flow

In `section 1.html` smart-paste flow:

1. Parse pasted text with parser module.
2. After audio upload success, call aligner (Deepgram primary).
3. Save final aligned payload using current storage route (`toeflStorage` / backend API).
4. Use `ReviewAudioPlayer` in review mode for transcript playback QA.

## Notes

- Deepgram and WhisperX both add external dependency/runtime requirements.
- WhisperX CPU mode on Windows can be slow for long recordings.
- Browser autoplay policies still require user interaction for reliable play on mobile.
