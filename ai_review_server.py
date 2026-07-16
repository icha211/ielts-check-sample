import json
import os
import re
import socket
import base64
import smtplib
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer

from google import genai

HOST = os.environ.get("AI_REVIEW_HOST", "0.0.0.0")
PORT = int(os.environ.get("AI_REVIEW_PORT", "8787"))
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
FALLBACK_MODEL = str(os.environ.get("GEMINI_FALLBACK_MODEL", "") or "").strip()
REPORT_ISSUE_TO = str(os.environ.get("REPORT_ISSUE_TO", "quickcheck.edu@gmail.com") or "quickcheck.edu@gmail.com").strip()
REPORT_SMTP_HOST = str(os.environ.get("REPORT_SMTP_HOST", "smtp.gmail.com") or "smtp.gmail.com").strip()
REPORT_SMTP_PORT = int(os.environ.get("REPORT_SMTP_PORT", "587"))
REPORT_SMTP_USER = str(os.environ.get("REPORT_SMTP_USER", "quickcheck.edu@gmail.com") or "quickcheck.edu@gmail.com").strip()
REPORT_SMTP_PASS = str(os.environ.get("REPORT_SMTP_PASS", "") or "").strip()
REPORT_QUEUE_FILE = str(os.environ.get("REPORT_QUEUE_FILE", "data/report_issue_queue.jsonl") or "data/report_issue_queue.jsonl").strip()


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


def is_quota_exceeded_error(exc: Exception) -> bool:
    msg = str(exc or "").upper()
    markers = (
        "RESOURCE_EXHAUSTED",
        "QUOTA EXCEEDED",
        "RATE LIMIT",
        "GENERATE_CONTENT_FREE_TIER",
        "429",
    )
    return any(marker in msg for marker in markers)


def parse_retry_after_seconds(exc: Exception):
    msg = str(exc or "")
    match = re.search(r"retry\s+in\s+([0-9]+(?:\.[0-9]+)?)s", msg, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1))
    except Exception:
        return None


def friendly_model_error(exc: Exception) -> str:
    if is_quota_exceeded_error(exc):
        retry_after = parse_retry_after_seconds(exc)
        wait_hint = f" Retry after about {int(retry_after) + 1}s." if retry_after else ""
        return (
            "Gemini quota/rate limit reached for the current API key. "
            "Please wait a moment and try again, or use a key/project with available quota."
            + wait_hint
        )
    return str(exc)


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

                wait_seconds = delays[attempt]
                retry_after = parse_retry_after_seconds(exc)
                if retry_after is not None:
                    # Respect provider backoff hints when available.
                    wait_seconds = max(wait_seconds, min(retry_after + 0.25, 20.0))

                time.sleep(wait_seconds)

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

    explanation_language = str(
        payload.get("explanationLanguage")
        or payload.get("targetLanguage")
        or "Bahasa Indonesia"
    ).strip()

    return f"""Please provide a step-by-step explanation for the following TOEFL ITP listening question.

IMPORTANT LANGUAGE RULE:
- Write all explanatory content in {explanation_language}.
- Keep only parser-critical markers in English exactly as written below (Step headers, "Test Tip:", "Note:", and "is wrong:").

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
    question_text = str(payload.get("questionText", "") or "").strip()
    options = payload.get("options", {}) or {}
    correct_answer = str(payload.get("correctAnswer", "") or "").strip().upper()
    transcript = str(payload.get("transcript", "") or "").strip()

    options_lines = "\n".join(
        f'  "{letter}": "{text}"' for letter, text in sorted(options.items())
    )

    return f"""You are a backend content engine for a TOEFL ITP preparation application. Your task is to analyze a TOEFL listening question, its corresponding transcript snippet, and output a structured JSON object that maps perfectly to a 4-step timeline UI component.

### STEP-BY-STEP ANALYSIS & LOGIC RULES:
You must break down the explanation into exactly 4 logical steps that replicate a master tutor's mental process:
1. **Targeted Listening Strategy**: Teach the student what specific markers, positions in the dialogue, or verbal cues to listen for based on the question type.
2. **Contextual Confirmation**: Trace how the dialogue develops immediately around that clue to secure the context.
3. **Paraphrase/Synonym Matching**: Map the literal words spoken in the transcript directly to the abstract or summarized terms in the correct answer choice.
4. **Distractor Deconstruction**: Systematically eliminate all three wrong options by pointing out classic TOEFL traps (e.g., too narrow, out of context, factually reversed).

### COLOR & STYLING RULES:
You must strictly embed inline styling HTML tags directly inside the text strings (`description`, `quote`, and `reasoning`) when referring to speakers or key vocabulary so the frontend can parse them:
1. **Identify the exact roles**: Look at the transcript to see who the actors are (e.g., Student, Librarian, Man, Woman).
2. **Male Speaker Styling**: Wrap the role name exactly in: <span style="color: #F3934F; font-weight: bold;">Role Name</span>
3. **Female Speaker Styling**: Wrap the role name exactly in: <span style="color: #676CFF; font-weight: bold;">Role Name</span>
4. **Key Clue Highlighting**: Wrap the exact target keywords/phrases from the audio or option text in: <mark style="background-color: #FFDE00; color: #000000; font-weight: 500;">highlighted text</mark>

### DYNAMIC STRATEGY RULE:
You must dynamically adjust the titles and analytical approach in Step 1 and Step 2 based on the question's focus:
*   **If Main Idea** (e.g., "mainly discussing"):
    *   `step_1.title` = "Listen for the Topic Opener"
    *   `step_2.title` = "Identify the Development/Resolution"
*   **If Detail / Reason / Method** (e.g., "Why...", "How...", "What does the speaker recommend"):
    *   `step_1.title` = "Listen for the Core Clue"
    *   `step_2.title` = "Identify the Supporting Detail"

### OUTPUT SCHEMA:
Respond ONLY with a valid JSON object matching this schema. Do not include markdown code block backticks (```json) or conversational introduction/outro fluff.

{{
  "step_1": {{
    "title": "Dynamic Title String",
    "description": "Strategy text explaining what targeted information to listen for. Apply speaker color tags.",
    "quote": "The raw quote containing the initial clue. Apply the yellow <mark> tag to the exact phrase."
  }},
  "step_2": {{
    "title": "Dynamic Title String",
    "description": "Context tracking text explaining how the surrounding dialogue supports the clue. Apply speaker color tags.",
    "quote": "The contextual supporting raw quote. Apply the yellow <mark> tag to important keywords."
  }},
  "step_3": {{
    "title": "Connect the Synonyms",
    "description": "Brief instruction showing how keywords from the audio clue map directly to the correct option.",
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
        "reasoning": "A single-sentence explanation starting with 'because...' detailing why this choice fails. Apply speaker color tags if referenced."
      }},
      {{
        "letter": "Option letter",
        "text": "Full text of option",
        "reasoning": "A single-sentence explanation starting with 'because...' detailing why this choice fails. Apply speaker color tags if referenced."
      }},
      {{
        "letter": "Option letter",
        "text": "Full text of option",
        "reasoning": "A single-sentence explanation starting with 'because...' detailing why this choice fails. Apply speaker color tags if referenced."
      }}
    ]
  }}
}}

QUESTION:
{question_text}

OPTIONS:
{options_lines}

CORRECT ANSWER:
{correct_answer}

TRANSCRIPT:
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

LANGUAGE REQUIREMENT:
- Write explanatory content in Bahasa Indonesia.
- Keep parser markers in English exactly as required.

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

    for key in ("step_1", "step_2", "step_3", "step_4"):
        if not isinstance(data.get(key), dict):
            return False

    step_1 = data["step_1"]
    step_2 = data["step_2"]
    step_3 = data["step_3"]
    step_4 = data["step_4"]

    if not str(step_1.get("title", "")).strip():
        return False
    if not str(step_1.get("description", "")).strip():
        return False
    if not str(step_1.get("quote", "")).strip():
        return False

    if not str(step_2.get("title", "")).strip():
        return False
    if not str(step_2.get("description", "")).strip():
        return False
    if not str(step_2.get("quote", "")).strip():
        return False

    if str(step_3.get("title", "")).strip() != "Connect the Synonyms":
        return False
    if not str(step_3.get("description", "")).strip():
        return False
    if not re.fullmatch(r"[A-D]", str(step_3.get("correct_option_letter", "")).strip().upper()):
        return False
    if not str(step_3.get("correct_option_text", "")).strip():
        return False
    if not str(step_3.get("closing_thought", "")).strip():
        return False

    if str(step_4.get("title", "")).strip() != "Eliminate the Wrong Answer":
        return False
    incorrect_options = step_4.get("incorrect_options")
    if not isinstance(incorrect_options, list) or len(incorrect_options) != 3:
        return False

    seen_letters = set()
    for item in incorrect_options:
        if not isinstance(item, dict):
            return False
        letter = str(item.get("letter", "")).strip().upper()
        reasoning = str(item.get("reasoning", "")).strip()
        if not re.fullmatch(r"[A-D]", letter):
            return False
        if letter in seen_letters:
            return False
        seen_letters.add(letter)
        if not str(item.get("text", "")).strip():
            return False
        if not reasoning.lower().startswith("because"):
            return False

    return True


def build_step_timeline_fix_prompt(previous_output: str) -> str:
    return f"""Rewrite the output below so it STRICTLY matches the required 4-step TOEFL JSON schema.

Requirements:
1) Output must be valid JSON only.
2) Include exactly the keys step_1, step_2, step_3, step_4.
3) step_3.title must be exactly "Connect the Synonyms".
4) step_4.title must be exactly "Eliminate the Wrong Answer".
5) step_4.incorrect_options must contain exactly 3 objects.
6) Each incorrect option reasoning must start with "because...".
7) Preserve the required inline HTML styling:
   - male speaker roles in <span style="color: #F3934F; font-weight: bold;">...</span>
   - female speaker roles in <span style="color: #676CFF; font-weight: bold;">...</span>
   - key phrases in <mark style="background-color: #FFDE00; color: #000000; font-weight: 500;">...</mark>
8) Do not add markdown fences or commentary.

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


def build_explanation_json_prompt(payload: dict) -> str:
        q_num = int(payload.get("active_question_number") or 0)
        question_text = str(payload.get("question_text") or "").strip()
        correct_letter = str(payload.get("correct_option_letter") or "").strip().upper()
        user_letter = str(payload.get("user_selected_letter") or "").strip().upper()
        isolated_block = str(payload.get("isolated_transcript_block") or "").strip()
        options_array = payload.get("options_array") or {}

        options_map = {"A": "", "B": "", "C": "", "D": ""}
        if isinstance(options_array, list):
                for raw in options_array:
                        text = str(raw or "").strip()
                        m = re.match(r"^\(?([A-D])\)?[\).:\-\s]*(.+)$", text, flags=re.IGNORECASE)
                        if m:
                                options_map[str(m.group(1)).upper()] = str(m.group(2) or "").strip()
        elif isinstance(options_array, dict):
                for key in ("A", "B", "C", "D"):
                        options_map[key] = str(options_array.get(key, "") or "").strip()

        return f"""You are the primary content intelligence engine for a premium TOEFL ITP test preparation application.

You are given:
1) question metadata
2) options A-D
3) an isolated transcript block that is the ONLY allowed evidence

STRICT RULES:
- Use ONLY evidence inside isolated_transcript_block.
- No hallucination, no generic placeholders, no unrelated dialogue.
- Inject highlight tags exactly as:
    <mark style=\"background-color: #FFDE00; color: #000000; font-weight: 500;\">...<\/mark>
- Output VALID JSON ONLY. No markdown fences.

INPUT:
question_number: {q_num}
question_text: {question_text}
correct_option_letter: {correct_letter}
user_selected_letter: {user_letter}
options:
    A: {options_map['A']}
    B: {options_map['B']}
    C: {options_map['C']}
    D: {options_map['D']}

isolated_transcript_block:
{isolated_block}

OUTPUT SCHEMA (EXACT KEYS):
{{
    "question_metadata": {{
        "question_number": {q_num},
        "question_text": "{question_text}",
        "user_was_correct": {str(user_letter == correct_letter).lower()}
    }},
    "options_status": [
        {{"letter":"A","text":"{options_map['A']}","is_correct_choice":{str(correct_letter == 'A').lower()},"is_user_answer":{str(user_letter == 'A').lower()}}},
        {{"letter":"B","text":"{options_map['B']}","is_correct_choice":{str(correct_letter == 'B').lower()},"is_user_answer":{str(user_letter == 'B').lower()}}},
        {{"letter":"C","text":"{options_map['C']}","is_correct_choice":{str(correct_letter == 'C').lower()},"is_user_answer":{str(user_letter == 'C').lower()}}},
        {{"letter":"D","text":"{options_map['D']}","is_correct_choice":{str(correct_letter == 'D').lower()},"is_user_answer":{str(user_letter == 'D').lower()}}}
    ],
    "explanation_payload": {{
        "header_title": "Why ({correct_letter})?",
        "main_explanation_html": "...",
        "dialogue_blocks": [
            {{
                "speaker_name": "Student",
                "speaker_gender": "male",
                "introduction_label": "For instance, if we look directly at the spoken dialogue, the Student clearly explains his situation by stating:",
                "quote_text_html": "..."
            }},
            {{
                "speaker_name": "Librarian",
                "speaker_gender": "female",
                "introduction_label": "The Librarian immediately solves this by responding:",
                "quote_text_html": "..."
            }}
        ],
        "closing_analysis_html": "..."
    }}
}}
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


def sanitize_review(review: dict) -> dict:
    return {
        "summary": str(review.get("summary", "No review summary returned.")),
        "estimatedBand": str(review.get("estimatedBand", "N/A")),
        "strengths": [str(x) for x in (review.get("strengths") or [])][:3],
        "improvements": [str(x) for x in (review.get("improvements") or [])][:3],
        "nextSteps": [str(x) for x in (review.get("nextSteps") or [])][:3],
    }


def normalize_email(value: str) -> str:
    return str(value or "").strip()


def email_is_valid(value: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", normalize_email(value)))


def generate_report_ticket_id(epoch_seconds: float = None) -> str:
    ts = float(time.time() if epoch_seconds is None else epoch_seconds)
    whole = int(ts)
    millis = int(round((ts - whole) * 1000.0))
    if millis > 999:
        millis = 999
    return time.strftime("%Y%m%d-%H%M%S", time.localtime(whole)) + f"-{millis:03d}"


def queue_report_issue(payload: dict, ticket_id: str) -> str:
    file_path = REPORT_QUEUE_FILE
    folder = os.path.dirname(file_path)
    if folder:
        os.makedirs(folder, exist_ok=True)

    row = {
        "ticket": ticket_id,
        "queuedAt": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
        "destination": REPORT_ISSUE_TO,
        "payload": payload,
    }
    with open(file_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=True) + "\n")

    return file_path


def send_report_issue_email(payload: dict, ticket_id: str):
    if not REPORT_SMTP_PASS:
        raise RuntimeError("Server email is not configured. Set REPORT_SMTP_PASS (Gmail App Password).")

    user_email = normalize_email(payload.get("email", ""))
    question = str(payload.get("question", "") or "").strip()
    details = str(payload.get("details", "") or "").strip()
    first_name = str(payload.get("firstName", "") or "").strip()
    last_name = str(payload.get("lastName", "") or "").strip()
    context = payload.get("context") or {}

    message = EmailMessage()
    message["Subject"] = f"[QuickCheck Report] Ticket {ticket_id}"
    message["From"] = REPORT_SMTP_USER
    message["To"] = REPORT_ISSUE_TO
    message["Reply-To"] = user_email or REPORT_SMTP_USER

    lines = [
        f"Ticket: {ticket_id}",
        f"User Email: {user_email or '-'}",
        f"First Name: {first_name or '-'}",
        f"Last Name: {last_name or '-'}",
        f"Question Number: {context.get('questionNumber', '-')}",
        f"Set ID: {context.get('setId', '-')}",
        f"Set Date: {context.get('setDate', '-')}",
        f"Module: {context.get('module', '-')}",
        f"Path: {context.get('pathname', '-')}",
        "",
        "Question:",
        question or "-",
        "",
        "Details:",
        details or "-",
    ]
    message.set_content("\n".join(lines))

    attachments = payload.get("attachments") or []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        base64_data = str(attachment.get("base64", "") or "").strip()
        name = str(attachment.get("name", "attachment") or "attachment").strip() or "attachment"
        mime_type = str(attachment.get("type", "application/octet-stream") or "application/octet-stream").strip()
        if not base64_data:
            continue
        try:
            maintype, subtype = mime_type.split("/", 1) if "/" in mime_type else ("application", "octet-stream")
        except Exception:
            maintype, subtype = "application", "octet-stream"
        message.add_attachment(base64.b64decode(base64_data), maintype=maintype, subtype=subtype, filename=name)

    if REPORT_SMTP_PORT == 465:
        with smtplib.SMTP_SSL(REPORT_SMTP_HOST, REPORT_SMTP_PORT, timeout=20) as smtp:
            smtp.login(REPORT_SMTP_USER, REPORT_SMTP_PASS)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(REPORT_SMTP_HOST, REPORT_SMTP_PORT, timeout=20) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(REPORT_SMTP_USER, REPORT_SMTP_PASS)
            smtp.send_message(message)


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
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self._send(400, {"error": f"Bad request: {exc}"})
            return

        if self.path == "/api/report-issue":
            question = str(payload.get("question", "") or "").strip()
            email = normalize_email(payload.get("email", ""))

            if not question:
                self._send(400, {"error": "question is required"})
                return
            if not email_is_valid(email):
                self._send(400, {"error": "valid email is required"})
                return

            ticket_id = generate_report_ticket_id()
            try:
                if REPORT_SMTP_PASS:
                    send_report_issue_email(payload, ticket_id)
                    self._send(200, {"ok": True, "ticket": ticket_id, "to": REPORT_ISSUE_TO, "delivery": "email"})
                else:
                    queue_path = queue_report_issue(payload, ticket_id)
                    self._send(
                        200,
                        {
                            "ok": True,
                            "ticket": ticket_id,
                            "to": REPORT_ISSUE_TO,
                            "delivery": "queued",
                            "queued": True,
                            "queuePath": queue_path,
                            "note": "SMTP is not configured. Report stored locally in queue.",
                        },
                    )
            except Exception as exc:
                self._send(500, {"error": str(exc)})
            return

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            self._send(500, {"error": "Set GEMINI_API_KEY or GOOGLE_API_KEY before starting the server."})
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
                self._send(500, {"error": friendly_model_error(exc)})

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
                self._send(500, {"error": friendly_model_error(exc)})

        elif self.path == "/api/toefl-explanation-json":
            try:
                isolated = str(payload.get("isolated_transcript_block") or "").strip()
                if not isolated:
                    self._send(400, {"error": "isolated_transcript_block is required and cannot be empty"})
                    return

                client = genai.Client(api_key=api_key)
                prompt = build_explanation_json_prompt(payload)
                response = generate_with_retry(client, prompt)
                text = (response.text or "").strip()
                data = parse_json_from_text(text)
                self._send(200, data)
            except Exception as exc:
                self._send(500, {"error": friendly_model_error(exc)})

        elif self.path == "/api/toefl-step-timeline":
            try:
                client = genai.Client(api_key=api_key)
                prompt = build_step_timeline_prompt(payload)
                response = generate_with_retry(client, prompt)
                text = (response.text or "").strip()

                try:
                    data = parse_json_from_text(text)
                except Exception:
                    data = None

                if not step_timeline_has_required_shape(data):
                    retry_prompt = build_step_timeline_fix_prompt(text)
                    retry_response = generate_with_retry(client, retry_prompt)
                    retry_text = (retry_response.text or "").strip()
                    data = parse_json_from_text(retry_text)

                if not step_timeline_has_required_shape(data):
                    raise ValueError("Model output did not match the required step timeline JSON schema")

                self._send(200, data)
            except Exception as exc:
                self._send(500, {"error": friendly_model_error(exc)})

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
                self._send(500, {"error": friendly_model_error(exc)})

        else:
            self._send(404, {"error": "Not found"})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    lan_ip = get_lan_ip()
    print(f"AI review server running on http://{HOST}:{PORT}")
    print(f"Local: http://127.0.0.1:{PORT}/api/health")
    print(f"LAN:   http://{lan_ip}:{PORT}/api/health")
    server.serve_forever()
