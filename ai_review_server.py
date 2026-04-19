import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from google import genai

HOST = "127.0.0.1"
PORT = int(os.environ.get("AI_REVIEW_PORT", "8787"))
MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")


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
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(200, {"ok": True})

    def do_POST(self):
        if self.path != "/api/ai-review":
            self._send(404, {"error": "Not found"})
            return

        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            self._send(500, {"error": "Set GEMINI_API_KEY or GOOGLE_API_KEY before starting the server."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))

            client = genai.Client(api_key=api_key)
            prompt = build_prompt(payload)
            response = client.models.generate_content(model=MODEL, contents=prompt)
            text = response.text or "{}"

            parsed = parse_json_from_text(text)
            review = sanitize_review(parsed)
            self._send(200, review)
        except Exception as exc:
            self._send(500, {"error": str(exc)})


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), Handler)
    print(f"AI review server running on http://{HOST}:{PORT}")
    server.serve_forever()
