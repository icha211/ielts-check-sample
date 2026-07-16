import json
import os
import re
import socket
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from google import genai

HOST = os.environ.get("AI_REVIEW_HOST", "0.0.0.0")
PORT = int(os.environ.get("AI_REVIEW_PORT", "8787"))
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
FALLBACK_MODEL = os.environ.get("GEMINI_FALLBACK_MODEL", "gemini-2.0-flash")


def is_transient_model_error(exc: Exception) -> bool:
    msg = str(exc or "").upper()
    transient_markers = (
        "503",
        "UNAVAILABLE",
        "429",
        "RESOURCE_EXHAUSTED",
        "DEADLINE_EXCEEDED",
        "TIMEOUT",
        "TIMED OUT",
        "CONNECTION RESET",
        "CONNECTION ABORTED",
    )
    return any(marker in msg for marker in transient_markers)


def generate_with_retry(client: genai.Client, prompt: str):
    models = [MODEL]
    if FALLBACK_MODEL and FALLBACK_MODEL != MODEL:
        models.append(FALLBACK_MODEL)

    delays = [0.8, 1.6, 3.2, 6.0]
    last_exc = None

    for model_name in models:
        for attempt in range(len(delays) + 1):
            try:
                return client.models.generate_content(model=model_name, contents=prompt)
            except Exception as exc:
                last_exc = exc
                if not is_transient_model_error(exc):
                    raise

                if attempt >= len(delays):
                    break

                time.sleep(delays[attempt])

    raise last_exc if last_exc else RuntimeError("Model generation failed")


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def build_prompt(payload: dict) -> str:
    module = payload.get("module", "general")
    module_title = payload.get("promptTitle", "IELTS response")

    instructions = (
        "You are an IELTS coach. Review the user's answer and return JSON with keys: "
        "summary (string), estimatedBand (string), strengths (string array, max 3), "
        "improvements (string array, max 3), nextSteps (string array, max 3). "
        "Keep concise and practical."
    )

    body = {
        "module": module,
        "title": module_title,
        "score": payload.get("score"),
        "details": payload,
    }

    return f"{instructions}\n\nDATA:\n{json.dumps(body, ensure_ascii=True)}"


def build_explanation_prompt(payload: dict) -> str:
    question_text = payload.get("questionText", "")
    options = payload.get("options", {})
    correct_answer = payload.get("correctAnswer", "")
    transcript = payload.get("transcript", "")

    options_lines = "\n".join(
        f"  ({letter}) {text}" for letter, text in sorted(options.items())
    )

    return f"""Please provide a step-by-step explanation for the following TOEFL ITP listening question.

CRITICAL RULE: Do not use generic headers like "Step 1: Find the Idiom" for every question. Instead, change the text of the step headers so they are perfectly customized to the specific question type (e.g., Idioms, Suggestions, Tone/Emotions, Main Topic, Details).

Use this EXACT Markdown structure, but change the bracketed text in the headers based on the question:

### Step 1: [Custom Action Verb based on the question type]
Look at the [man's/woman's] response: *"[Quote the sentence containing the clue with key words in **bold**]"*

💡 **Test Tip:** [Provide a short, high-value beginner tip about listening cues or patterns specific to this question type].

### Step 2: [Custom Question explaining the core meaning or concept]
* **"[Key Term/Concept]"** [Explain the meaning, suggestion, or situation in simple English].
* *Note: [Explain what a beginner might get confused by or why the literal words shouldn't be misinterpreted].*

### Step 3: Why the other answers are wrong
The test tries to trick you by using words from the conversation out of context:

* ❌ **([Letter]) is wrong:** [Explain the specific trap].
* ❌ **([Letter]) is wrong:** [Explain the specific trap].
* ❌ **([Letter]) is wrong:** [Explain the specific trap].

---
QUESTION DATA:

Question: {question_text}

Answer choices:
{options_lines}

Correct answer: ({correct_answer})

Conversation transcript:
{transcript}

IMPORTANT: Output ONLY the three steps in the exact Markdown format above. No extra headings or text outside the three steps.
"""


def build_step_timeline_prompt(payload: dict) -> str:
    question_text = str(payload.get("questionText", "") or "")
    options = payload.get("options", {}) or {}
    correct_answer = str(payload.get("correctAnswer", "") or "").strip().upper()
    transcript = str(payload.get("transcript", "") or "")
    raw_transcript = str(payload.get("rawTranscript", "") or "")
    question_number = payload.get("questionNumber", "")

    if raw_transcript and str(question_number).strip():
        transcript_payload = extract_question_transcript_payload(raw_transcript, question_number)
        transcript_blocks = transcript_payload.get("transcript_blocks") or []
        if transcript_blocks:
            transcript = "\n".join(
                f'{block.get("speaker_name", "Speaker")}: "{block.get("dialogue_text", "")}"'
                for block in transcript_blocks
            )

    options_lines = "\n".join(
        f"  ({letter}) {text}" for letter, text in sorted(options.items())
    )

    return f"""You are a backend content engine for a TOEFL ITP preparation application. Your task is to analyze a single TOEFL listening question and output a highly specific structured JSON object that maps perfectly to a 4-step timeline UI component.

### TRANSCRIPT PARSING RULE:
You MUST isolate and extract your quotes and strategies ONLY from the provided transcript block for the active question. Do NOT use generic placeholder text.

### COLOR & STYLING RULES:
You must strictly embed inline styling HTML tags directly inside the text values (`description`, `quote`, and `reasoning`) when referring to speakers or key vocabulary:
1. For the Male speaker: Wrap their role name in `<span style="color: #F3934F; font-weight: bold;">Role Name</span>`.
2. For the Female speaker: Wrap their role name in `<span style="color: #676CFF; font-weight: bold;">Role Name</span>`.
3. For key audio clues or critical matched vocabulary: Wrap the phrase in `<mark style="background-color: #FFDE00; color: #000000; font-weight: 500;">highlighted phrase</mark>`.

### DYNAMIC STRATEGY RULE:
- If the question asks for the MAIN IDEA:
  - Step 1 Title: "Listen for the Topic Opener"
  - Step 2 Title: "Identify the Location Solution"
- If the question asks for a SPECIFIC DETAIL, METHOD, or REASON:
  - Step 1 Title: "Listen for the Core Clue"
  - Step 2 Title: "Identify the Supporting Detail"

### LOGIC RULE:
- In `step_4`, each incorrect option reasoning must start with "because..." and must be unique and specific to the transcript.

Respond ONLY with a valid JSON object matching this schema:
{{
  "step_1": {{
    "title": "[Dynamic Title]",
    "description": "[Strategy text with inline speaker color tags]",
    "quote": "[Exact transcript quote with <mark> highlights]"
  }},
  "step_2": {{
    "title": "[Dynamic Title]",
    "description": "[Context tracking text with inline speaker color tags]",
    "quote": "[Exact secondary quote with <mark> highlights]"
  }},
  "step_3": {{
    "title": "Connect the Synonyms",
    "description": "Look at the choices. Match the student's problem to the specific option letter.",
    "correct_option_letter": "A, B, C, or D",
    "correct_option_text": "The full exact text of the correct answer choice.",
    "closing_thought": "A brief conclusion sentence showing they mean the exact same thing."
  }},
  "step_4": {{
    "title": "Eliminate the Wrong Answer",
    "incorrect_options": [
      {{
        "letter": "Option letter",
        "text": "Full text of option",
        "reasoning": "because..."
      }},
      {{
        "letter": "Option letter",
        "text": "Full text of option",
        "reasoning": "because..."
      }},
      {{
        "letter": "Option letter",
        "text": "Full text of option",
        "reasoning": "because..."
      }}
    ]
  }}
}}

QUESTION:
{question_text}

ANSWER CHOICES:
{options_lines}

CORRECT ANSWER:
({correct_answer})

ACTIVE QUESTION TRANSCRIPT:
{transcript}
"""


def explanation_has_required_shape(text: str) -> bool:
    body = str(text or "").strip()
    if not body:
        return False

    # Must have exactly Step 1/2/3 headings in markdown style.
    step_headers = [m.group(1) for m in __import__("re").finditer(r"(?im)^\s*#{2,4}\s*Step\s*(\d+)\s*:\s*.+$", body)]
    if step_headers != ["1", "2", "3"]:
        return False

    # Must include test tip marker.
    if "test tip" not in body.lower():
        return False

    # Must include a Step 2 note line.
    if "note:" not in body.lower():
        return False

    # Step 3 needs at least 3 wrong-option bullets like (A) is wrong: ...
    wrong_lines = __import__("re").findall(r"(?im)^\s*[-*]\s*(?:❌\s*)?\*\*\(([A-D])\)\s*is\s*wrong\s*:\*\*\s*.+$", body)
    return len(wrong_lines) >= 3


def build_explanation_fix_prompt(previous_output: str) -> str:
    return f"""Rewrite the output below so it STRICTLY matches the required TOEFL explanation format.

Requirements:
1) Exactly 3 step headers in this order:
   ### Step 1: ...
   ### Step 2: ...
   ### Step 3: Why the other answers are wrong
2) Include a Test Tip line in Step 1 using: 💡 **Test Tip:** ...
3) Step 3 must include exactly 3 bullet lines for wrong options, with this syntax:
   - ❌ **(A) is wrong:** ...
   - ❌ **(B) is wrong:** ...
   - ❌ **(C) is wrong:** ...
   (Use the actual wrong letters for this question.)
4) Keep the explanation specific to the transcript and answer options. No generic filler.
5) Output only the final markdown explanation.

OUTPUT TO REWRITE:
{previous_output}
"""


def step_timeline_has_required_shape(data: dict) -> bool:
    if not isinstance(data, dict):
        return False
    step_1 = data.get("step_1")
    step_2 = data.get("step_2")
    step_3 = data.get("step_3")
    step_4 = data.get("step_4")
    if not all(isinstance(step, dict) for step in (step_1, step_2, step_3, step_4)):
        return False
    required_text_fields = [
        step_1.get("title"), step_1.get("description"), step_1.get("quote"),
        step_2.get("title"), step_2.get("description"), step_2.get("quote"),
        step_3.get("title"), step_3.get("description"), step_3.get("correct_option_letter"),
        step_3.get("correct_option_text"), step_3.get("closing_thought"),
        step_4.get("title"),
    ]
    if any(not str(value or "").strip() for value in required_text_fields):
        return False
    incorrect = step_4.get("incorrect_options")
    if not isinstance(incorrect, list) or len(incorrect) != 3:
        return False
    for item in incorrect:
        if not isinstance(item, dict):
            return False
        if not str(item.get("letter") or "").strip():
            return False
        if not str(item.get("text") or "").strip():
            return False
        reasoning = str(item.get("reasoning") or "").strip()
        if not reasoning or not reasoning.lower().startswith("because"):
            return False
    return True


def build_step_timeline_fix_prompt(previous_output: str) -> str:
    return f"""Rewrite the output below so it is a valid JSON object matching the required 4-step TOEFL timeline schema.

Rules:
1. Return ONLY JSON.
2. Include keys: step_1, step_2, step_3, step_4.
3. step_1 and step_2 must each include title, description, quote.
4. step_3 must include title, description, correct_option_letter, correct_option_text, closing_thought.
5. step_4 must include title and exactly 3 incorrect_options.
6. Each incorrect option must include letter, text, and reasoning that starts with "because".
7. Preserve any inline <span> and <mark> formatting where appropriate.

OUTPUT TO REWRITE:
{previous_output}
"""


def build_translation_prompt(payload: dict) -> str:
    explanation_markdown = str(payload.get("explanationMarkdown", "") or "").strip()
    target_language = str(payload.get("targetLanguage", "Bahasa Indonesia") or "Bahasa Indonesia").strip()

    return f"""Translate the TOEFL explanation markdown below into {target_language}.

STRICT RULES:
1) Keep the markdown structure EXACTLY the same.
2) Keep these labels in English EXACTLY as-is so the app parser keeps working:
   - Step headers (### Step 1:, ### Step 2:, ### Step 3: Why the other answers are wrong)
   - "Test Tip:"
   - "Note:"
   - bullet syntax for wrong answers: - ❌ **(X) is wrong:**
3) Translate ALL natural-language content into natural, beginner-friendly Indonesian, including the quoted transcript sentence in Step 1.
4) Keep punctuation/markdown markers intact (quotes, *, **, bullet symbols) while translating the words inside them.
5) Do not add extra sections, introductions, or conclusions.
6) Output only the translated markdown.

MARKDOWN TO TRANSLATE:
{explanation_markdown}
"""


def build_quote_translation_prompt(quote_text: str, target_language: str) -> str:
    return f"""Translate this short TOEFL listening transcript quote into {target_language}.

Rules:
1) Output only the translated quote text.
2) Do not add explanations.
3) Keep the meaning and tone faithful.

QUOTE:
{quote_text}
"""


def extract_first_markdown_quote(markdown: str) -> str:
    body = str(markdown or "")
    match = re.search(r'["\u201c](.+?)["\u201d]', body, flags=re.DOTALL)
    if not match:
        return ""
    return str(match.group(1) or "").strip()


def replace_first_markdown_quote(markdown: str, new_quote: str) -> str:
    body = str(markdown or "")
    quote = str(new_quote or "").strip()
    if not body or not quote:
        return body

    return re.sub(
        r'(["\u201c])(.+?)(["\u201d])',
        lambda m: f"{m.group(1)}{quote}{m.group(3)}",
        body,
        count=1,
        flags=re.DOTALL,
    )


def is_likely_same_quote(source_quote: str, translated_quote: str) -> bool:
    src = re.sub(r'\s+', ' ', str(source_quote or '').strip().lower())
    dst = re.sub(r'\s+', ' ', str(translated_quote or '').strip().lower())
    return bool(src) and src == dst


def parse_json_from_text(text: str) -> dict:
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return json.loads(text)

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError("No JSON object in model output")


def format_timestamp_display(value: str) -> str:
    raw = str(value or "").strip()
    match = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$", raw)
    if not match:
        return raw
    first = int(match.group(1))
    second = int(match.group(2))
    third = match.group(3)
    if third is not None:
        total_seconds = (first * 3600) + (second * 60) + int(third)
        minutes = total_seconds // 60
        seconds = total_seconds % 60
        return f"{minutes:02d}:{seconds:02d}"
    return f"{first:02d}:{second:02d}"


def timestamp_to_milliseconds(value: str) -> int:
    raw = str(value or "").strip()
    match = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?$", raw)
    if not match:
        return 0
    first = int(match.group(1))
    second = int(match.group(2))
    third = match.group(3)
    fraction = (match.group(4) or "0") + "000"
    ms = int(fraction[:3])
    if third is not None:
        base_seconds = (first * 3600) + (second * 60) + int(third)
    else:
        base_seconds = (first * 60) + second
    return (base_seconds * 1000) + ms


def infer_speaker_gender_and_name(speaker: str) -> tuple[str, str]:
    value = str(speaker or "").strip()
    upper = value.upper()
    if upper in ("STUDENT", "MAN", "STUDENT A", "MALE STUDENT"):
        return "male", "Student" if upper.startswith("STUDENT") else "Man"
    if upper in ("LIBRARIAN", "WOMAN", "STUDENT B", "FEMALE STUDENT"):
        return "female", "Librarian" if upper == "LIBRARIAN" else "Woman"
    if upper.startswith("NARR"):
        return "unknown", "Narrator"
    if upper.startswith("MAN"):
        return "male", "Man"
    if upper.startswith("WOM"):
        return "female", "Woman"
    if upper.startswith("STUDENT"):
        return "male", "Student"
    return "unknown", value or "Narrator"


def extract_question_transcript_payload(raw_transcript: str, question_number: int | str) -> dict:
    body = str(raw_transcript or "")
    q_num = str(question_number or "").strip()
    if not q_num:
        return {"active_question": "", "transcript_blocks": []}

    active_question = int(q_num) if q_num.isdigit() else q_num
    active_question_text = str(active_question)
    block_text = ""

    tagged_pattern = re.compile(
        rf"<Question\s*{re.escape(active_question_text)}>\s*([\s\S]*?)\s*</Question\s*{re.escape(active_question_text)}>",
        flags=re.I,
    )
    tagged_match = tagged_pattern.search(body)
    if tagged_match:
        block_text = tagged_match.group(1)
    else:
        plain_pattern = re.compile(
            rf"(^|\n)\s*Question\s*{re.escape(active_question_text)}\s*\n([\s\S]*?)(?=\n\s*(?:Question\s*\d+|<Question\s*\d+>|</Question\s*{re.escape(active_question_text)}>)|\Z)",
            flags=re.I,
        )
        plain_match = plain_pattern.search(body)
        if plain_match:
            block_text = plain_match.group(2)

    if not block_text.strip():
        return {"active_question": active_question, "transcript_blocks": []}

    transcript_blocks = []
    line_pattern = re.compile(
        r"^\s*(?P<start>\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)\s*(?:-\s*(?P<end>\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?))?\s+(?P<speaker>[A-Za-z][A-Za-z ]*?)\s*:\s*(?P<text>.+?)\s*$"
    )
    for raw_line in block_text.splitlines():
        line = str(raw_line or "").strip()
        if not line:
            continue
        match = line_pattern.match(line)
        if not match:
            continue
        gender, normalized_name = infer_speaker_gender_and_name(match.group("speaker"))
        if gender not in ("male", "female"):
            continue
        dialogue_text = str(match.group("text") or "").strip()
        if not dialogue_text:
            continue
        start_raw = str(match.group("start") or "").strip()
        end_raw = str(match.group("end") or "").strip()
        start_ms = timestamp_to_milliseconds(start_raw)
        end_ms = timestamp_to_milliseconds(end_raw) if end_raw else max(start_ms + 8000, start_ms)
        transcript_blocks.append(
            {
                "speaker_name": normalized_name,
                "speaker_gender": gender,
                "timestamp_display": format_timestamp_display(start_raw),
                "start_ms": start_ms,
                "end_ms": end_ms,
                "dialogue_text": dialogue_text,
            }
        )

    return {"active_question": active_question, "transcript_blocks": transcript_blocks}


def sanitize_review(review: dict) -> dict:
    return {
        "summary": str(review.get("summary", "No review summary returned.")),
        "estimatedBand": str(review.get("estimatedBand", "N/A")),
        "strengths": [str(x) for x in (review.get("strengths") or [])][:3],
        "improvements": [str(x) for x in (review.get("improvements") or [])][:3],
        "nextSteps": [str(x) for x in (review.get("nextSteps") or [])][:3],
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def _send_text(self, status: int, text: str):
        data = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_GET(self):
        if self.path in ("/", "/api/health"):
            self._send(200, {"ok": True, "model": MODEL})
        else:
            self._send(404, {"error": "Not found"})

    def do_POST(self):
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            self._send(500, {"error": "Set GEMINI_API_KEY or GOOGLE_API_KEY before starting the server."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self._send(400, {"error": f"Bad request: {exc}"})
            return

        if self.path == "/api/ai-review":
            try:
                client = genai.Client(api_key=api_key)
                prompt = build_prompt(payload)
                response = generate_with_retry(client, prompt)
                text = response.text or "{}"
                parsed = parse_json_from_text(text)
                review = sanitize_review(parsed)
                self._send(200, review)
            except Exception as exc:
                self._send(500, {"error": str(exc)})

        elif self.path == "/api/toefl-explanation":
            try:
                client = genai.Client(api_key=api_key)
                prompt = build_explanation_prompt(payload)
                response = generate_with_retry(client, prompt)
                text = (response.text or "").strip()

                # If the first pass doesn't match the required format, retry once with a strict rewrite prompt.
                if not explanation_has_required_shape(text):
                    retry_prompt = build_explanation_fix_prompt(text)
                    retry_response = generate_with_retry(client, retry_prompt)
                    retry_text = (retry_response.text or "").strip()
                    if retry_text:
                        text = retry_text

                self._send_text(200, text)
            except Exception as exc:
                self._send(500, {"error": str(exc)})

        elif self.path == "/api/toefl-step-timeline":
            try:
                client = genai.Client(api_key=api_key)
                prompt = build_step_timeline_prompt(payload)
                response = generate_with_retry(client, prompt)
                text = (response.text or "").strip()
                parsed = parse_json_from_text(text)

                if not step_timeline_has_required_shape(parsed):
                    retry_prompt = build_step_timeline_fix_prompt(text)
                    retry_response = generate_with_retry(client, retry_prompt)
                    retry_text = (retry_response.text or "").strip()
                    parsed = parse_json_from_text(retry_text)

                if not step_timeline_has_required_shape(parsed):
                    raise ValueError("Invalid step timeline shape returned by model")

                self._send(200, parsed)
            except Exception as exc:
                self._send(500, {"error": str(exc)})

        elif self.path == "/api/translate-explanation":
            try:
                explanation_markdown = str(payload.get("explanationMarkdown", "") or "").strip()
                if not explanation_markdown:
                    self._send(400, {"error": "explanationMarkdown is required"})
                    return

                client = genai.Client(api_key=api_key)
                prompt = build_translation_prompt(payload)
                response = generate_with_retry(client, prompt)
                text = (response.text or "").strip()

                source_quote = extract_first_markdown_quote(explanation_markdown)
                translated_quote = extract_first_markdown_quote(text)
                if source_quote and (not translated_quote or is_likely_same_quote(source_quote, translated_quote)):
                    quote_prompt = build_quote_translation_prompt(source_quote, str(payload.get("targetLanguage", "Bahasa Indonesia") or "Bahasa Indonesia"))
                    quote_response = generate_with_retry(client, quote_prompt)
                    forced_quote = (quote_response.text or "").strip().strip('"').strip('“').strip('”').strip()
                    if forced_quote:
                        text = replace_first_markdown_quote(text, forced_quote)

                self._send_text(200, text)
            except Exception as exc:
                self._send(500, {"error": str(exc)})

        elif self.path == "/api/toefl-question-transcript":
            try:
                raw_transcript = str(payload.get("rawTranscript", "") or "")
                question_number = payload.get("questionNumber", "")
                if not raw_transcript.strip():
                    self._send(400, {"error": "rawTranscript is required"})
                    return
                if str(question_number).strip() == "":
                    self._send(400, {"error": "questionNumber is required"})
                    return
                self._send(200, extract_question_transcript_payload(raw_transcript, question_number))
            except Exception as exc:
                self._send(500, {"error": str(exc)})

        else:
            self._send(404, {"error": "Not found"})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    lan_ip = get_lan_ip()
    print(f"AI review server running on http://{HOST}:{PORT}")
    print(f"Local: http://127.0.0.1:{PORT}/api/health")
    print(f"LAN:   http://{lan_ip}:{PORT}/api/health")
    server.serve_forever()
