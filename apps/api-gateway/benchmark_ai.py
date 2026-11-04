"""Offline review gate for recorded Gemini/DeepSeek pilot outputs; makes no API calls."""

import argparse
import json
from pathlib import Path

from routes.explanation import _parse_json


CASES = [
    {"id": "location", "transcript": "Man: Where is the lab?\nWoman: Beside the library.", "question": "Where is the lab?", "options": {"A": "Beside the library", "B": "Inside the library", "C": "At the station", "D": "At home"}, "answer": "A"},
    {"id": "inference", "transcript": "Man: Shall we walk?\nWoman: With this rain, I'd rather take the bus.", "question": "What does the woman prefer?", "options": {"A": "Walking", "B": "Taking the bus", "C": "Waiting at home", "D": "Cycling"}, "answer": "B"},
    {"id": "time", "transcript": "Woman: Is the meeting at three?\nMan: It moved to four.", "question": "When is the meeting?", "options": {"A": "Two", "B": "Three", "C": "Four", "D": "Five"}, "answer": "C"},
    {"id": "negative", "transcript": "Woman: Did you finish the report?\nMan: Not yet. I still need the final figures.", "question": "Why is the report unfinished?", "options": {"A": "He lost it", "B": "He cannot type", "C": "He missed the deadline", "D": "He needs final figures"}, "answer": "D"},
    {"id": "suggestion", "transcript": "Man: I can't find the article.\nWoman: Try the archive on the second floor.", "question": "What does the woman suggest?", "options": {"A": "Checking the archive", "B": "Buying a book", "C": "Leaving the building", "D": "Calling the author"}, "answer": "A"},
]


def evaluate(results: list[dict]) -> dict:
    expected = {(provider, case["id"]) for provider in ("gemini", "deepseek") for case in CASES}
    received = [(result["provider"], result["id"]) for result in results]
    if len(received) != len(set(received)) or set(received) != expected:
        raise ValueError("Record exactly one result per provider for every benchmark case")
    cases = {case["id"]: case for case in CASES}
    failures = []
    for result in results:
        case = cases[result["id"]]
        try:
            parsed = _parse_json(result["text"])
            correct = [option["letter"] for option in parsed["options_status"] if option.get("is_correct_choice") is True]
            if correct != [case["answer"]]:
                raise ValueError("Wrong answer mapping")
            payload = parsed["explanation_payload"]
            if not payload.get("main_explanation_html") or not payload.get("distractor_analysis"):
                raise ValueError("Explanation is incomplete")
            if result.get("reviewer_correct") is not True or result.get("reviewer_grounded") is not True:
                raise ValueError("Human correctness/grounding review did not pass")
            if not 0 < result["latency_ms"] <= 30000:
                raise ValueError("Latency exceeds the 30-second pilot target")
            if not 0 < result["output_tokens"] <= 2048 or not 0 < result["input_tokens"] <= 16000:
                raise ValueError("Token usage is missing or outside the pilot bounds")
        except (ValueError, KeyError, TypeError) as exc:
            failures.append({"provider": result["provider"], "id": case["id"], "reason": str(exc)})
    return {
        "passed": not failures, "cases_per_provider": len(CASES), "failures": failures,
        "note": "Pilot gate only: expand to representative real tasks and obtain owner approval before switching providers.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", action="store_true")
    parser.add_argument("--results", type=Path)
    args = parser.parse_args()
    if args.fixtures:
        print(json.dumps(CASES, indent=2))
    elif args.results:
        report = evaluate(json.loads(args.results.read_text(encoding="utf-8")))
        print(json.dumps(report, indent=2))
        raise SystemExit(0 if report["passed"] else 1)
    else:
        parser.error("Use --fixtures or --results <recorded-results.json>")
