import json
import os
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
3) Translate only the explanatory sentence content into natural, beginner-friendly Indonesian.
4) Do not add extra sections, introductions, or conclusions.
5) Output only the translated markdown.

MARKDOWN TO TRANSLATE:
{explanation_markdown}
"""


def parse_json_from_text(text: str) -> dict:
    text = text.strip()
    if text.startswith("{") and text.endswith("}"):
        return json.loads(text)

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError("No JSON object in model output")


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
                self._send_text(200, text)
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
