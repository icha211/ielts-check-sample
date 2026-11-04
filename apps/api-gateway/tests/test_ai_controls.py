import concurrent.futures
import io
import json
import threading
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from google.api_core.exceptions import ServiceUnavailable

import ai_runtime
import auth
from benchmark_ai import CASES, evaluate
from main import create_app
from routes import chat, evaluation, explanation

GEMINI_FACTORY = ai_runtime._gemini_client


class QuotaTests(unittest.TestCase):
    def setUp(self):
        self.state = {}
        self.control = {"enabled": True}
        self.lock = threading.Lock()
        self.client = Mock()
        def document(name):
            ref = Mock()
            ref.get.return_value.to_dict.side_effect = lambda: dict(self.control if name == "current" else self.state)
            return ref
        self.client.collection.return_value.document.side_effect = document
        self.client.transaction.return_value.set.side_effect = lambda ref, data: self.state.update(data)
        def transactional(function):
            def run(transaction):
                with self.lock:
                    return function(transaction)
            return run
        patch.object(ai_runtime, "_quota_client", return_value=self.client).start()
        patch.object(ai_runtime.firestore, "transactional", side_effect=transactional).start()
        patch.object(ai_runtime.settings, "ai_enabled", True).start()
        self.addCleanup(patch.stopall)

    def test_defaults_enforce_two_per_minute_and_ten_per_user_per_day(self):
        for _ in range(2):
            ai_runtime.reserve_generation("one")
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.reserve_generation("one")
        self.assertEqual(failure.exception.status_code, 429)
        self.assertEqual(self.state["count"], 2)
        self.state["users"]["one"]["count"] = 10
        self.state["users"]["one"]["minute"] = "past"
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.reserve_generation("one")
        self.assertIn("daily", failure.exception.detail)

    def test_global_cap_is_exact_across_concurrent_reservations(self):
        def request(index):
            try:
                ai_runtime.reserve_generation(str(index))
                return 200
            except HTTPException as exc:
                return exc.status_code
        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
            statuses = list(pool.map(request, range(150)))
        self.assertEqual(statuses.count(200), 100)
        self.assertEqual(statuses.count(429), 50)
        self.assertEqual(self.state["count"], 100)

    def test_daily_user_cap_is_exactly_ten(self):
        with patch.object(ai_runtime.settings, "ai_minute_user_limit", 10):
            for _ in range(10):
                ai_runtime.reserve_generation("one")
            with self.assertRaises(HTTPException) as failure:
                ai_runtime.reserve_generation("one")
        self.assertEqual(failure.exception.status_code, 429)
        self.assertEqual(self.state["count"], 10)
        self.assertEqual(self.state["users"]["one"]["count"], 10)

    def test_daily_counter_document_uses_utc_date(self):
        ai_runtime.reserve_generation("one")
        from datetime import datetime, timezone
        documents = [call.args[0] for call in self.client.collection.return_value.document.call_args_list]
        self.assertIn(datetime.now(timezone.utc).strftime("%Y-%m-%d"), documents)

    def test_environment_and_live_kill_switch_disable_generation(self):
        with patch.object(ai_runtime.settings, "ai_enabled", False):
            with self.assertRaises(HTTPException) as failure:
                ai_runtime.reserve_generation("one")
            self.assertEqual(failure.exception.status_code, 503)
        self.control["enabled"] = False
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.reserve_generation("one")
        self.assertEqual(failure.exception.status_code, 503)
        self.assertEqual(self.state, {})

    def test_missing_control_document_fails_closed(self):
        self.control.clear()
        with self.assertRaises(HTTPException):
            ai_runtime.reserve_generation("one")
        self.assertEqual(self.state, {})

    def test_quota_service_outage_fails_closed(self):
        self.client.collection.side_effect = ServiceUnavailable("offline")
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.reserve_generation("one")
        self.assertEqual(failure.exception.status_code, 503)

    def test_invalid_uid_never_obtains_a_quota_slot(self):
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.reserve_generation("")
        self.assertEqual(failure.exception.status_code, 401)
        self.assertEqual(self.state, {})


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.reserve = patch.object(ai_runtime, "reserve_generation").start()
        self.client = Mock()
        self.client.models.generate_content.return_value.text = "Reply"
        self.client.models.generate_content.return_value.candidates = []
        factory = patch.object(ai_runtime, "_gemini_client").start()
        factory.return_value.__enter__.return_value = self.client
        patch.object(ai_runtime.settings, "ai_provider", "gemini").start()
        self.addCleanup(patch.stopall)

    def test_gemini_output_is_bounded_and_single_call(self):
        self.assertEqual(ai_runtime.generate_text("Question", "one"), "Reply")
        self.reserve.assert_called_once_with("one")
        config = self.client.models.generate_content.call_args.kwargs["config"]
        self.assertEqual(config.max_output_tokens, 2048)
        self.client.models.generate_content.assert_called_once()

    def test_gemini_sdk_configuration_disables_hidden_retries_and_bounds_timeout(self):
        with (
            patch.dict(ai_runtime.os.environ, {"GEMINI_API_KEY": "test-key"}),
            patch.object(ai_runtime.genai, "Client") as client,
        ):
            GEMINI_FACTORY()
            options = client.call_args.kwargs["http_options"]
        self.assertEqual(options.timeout, 60000)
        self.assertEqual(options.retry_options.attempts, 1)

    def test_provider_transport_failure_is_explicit_and_not_retried(self):
        from httpx import ReadTimeout
        self.client.models.generate_content.side_effect = ReadTimeout("Timed out")
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.generate_text("Question", "one")
        self.assertEqual(failure.exception.status_code, 502)
        self.client.models.generate_content.assert_called_once()
        self.reserve.assert_called_once()

    def test_over_limit_or_empty_prompts_never_charge_or_call_provider(self):
        for prompt in ("", "x" * 16001):
            with self.assertRaises(HTTPException):
                ai_runtime.generate_text(prompt, "one")
        self.reserve.assert_not_called()
        self.client.models.generate_content.assert_not_called()

    def test_quota_rejection_never_calls_provider(self):
        self.reserve.side_effect = HTTPException(429, "Limit reached")
        with self.assertRaises(HTTPException):
            ai_runtime.generate_text("Question", "one")
        self.client.models.generate_content.assert_not_called()

    def test_failed_provider_call_does_not_retry_or_refund_reservation(self):
        self.client.models.generate_content.side_effect = ValueError("failed")
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.generate_text("Question", "one")
        self.assertEqual(failure.exception.status_code, 502)
        self.reserve.assert_called_once()
        self.client.models.generate_content.assert_called_once()

    def test_deepseek_requires_benchmark_approval(self):
        with patch.object(ai_runtime.settings, "ai_provider", "deepseek"):
            with self.assertRaises(HTTPException) as failure:
                ai_runtime.generate_text("Question", "one")
        self.assertEqual(failure.exception.status_code, 503)
        self.reserve.assert_not_called()

    def test_deepseek_has_bounded_tokens_disabled_thinking_and_timeout(self):
        response = Mock()
        response.read.return_value = json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": '{"ok":true}'}}]}).encode()
        with (
            patch.object(ai_runtime.settings, "ai_provider", "deepseek"),
            patch.object(ai_runtime.settings, "deepseek_benchmark_approved", True),
            patch.dict(ai_runtime.os.environ, {"DEEPSEEK_API_KEY": "test-key"}),
            patch.object(ai_runtime.urllib.request, "urlopen") as urlopen,
        ):
            urlopen.return_value.__enter__.return_value = response
            self.assertEqual(ai_runtime.generate_text("Return JSON", "one", json_output=True), '{"ok":true}')
            request = urlopen.call_args.args[0]
            data = json.loads(request.data)
            self.assertEqual(data["model"], "deepseek-flash")
            self.assertEqual(data["max_tokens"], 2048)
            self.assertEqual(data["thinking"], {"type": "disabled"})
            self.assertEqual(data["response_format"], {"type": "json_object"})
            self.assertEqual(urlopen.call_args.kwargs["timeout"], 60)
        self.reserve.assert_called_once_with("one")

    def test_audio_size_limit_rejects_before_provider_and_quota(self):
        with self.assertRaises(HTTPException) as failure:
            ai_runtime.generate_audio(b"x" * (ai_runtime.MAX_AUDIO_BYTES + 1), "audio/mpeg", "Transcribe", "one")
        self.assertEqual(failure.exception.status_code, 413)
        self.reserve.assert_not_called()
        self.client.models.generate_content.assert_not_called()


class AiApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app())
        patch.object(auth, "_firebase_app", return_value=Mock()).start()
        self.verify = patch.object(auth.auth, "verify_id_token", return_value={"uid": "student", "firebase": {"sign_in_provider": "password"}}).start()
        self.chat_generate = patch.object(chat, "generate_text", return_value="Tutor reply").start()
        self.eval_generate = patch.object(evaluation, "generate_text", return_value='{"summary":"Practice feedback","estimated_band":6,"strengths":[],"improvements":[],"next_steps":[]}').start()
        self.explain_generate = patch.object(explanation, "generate_text", return_value='{"question_metadata":{},"options_status":[],"explanation_payload":{}}').start()
        self.addCleanup(patch.stopall)
        self.headers = {"Authorization": "Bearer signed-token"}

    def test_anonymous_requests_are_rejected_before_generation(self):
        for path, body in (
            ("/api/chat", {"module": "reading", "message": "Question"}),
            ("/api/evaluation", {"module": "writing", "submission_text": "Answer"}),
            ("/api/toefl-explanation-json", {"isolated_transcript_block": "Woman: Hello"}),
            ("/api/translate-explanation", {"explanationMarkdown": "Quote"}),
        ):
            self.assertEqual(self.client.post(path, json=body).status_code, 401)
        self.chat_generate.assert_not_called()
        self.eval_generate.assert_not_called()
        self.explain_generate.assert_not_called()

    def test_firebase_anonymous_sessions_are_forbidden(self):
        self.verify.return_value = {"uid": "anon", "firebase": {"sign_in_provider": "anonymous"}}
        self.assertEqual(self.client.post("/api/chat", headers=self.headers, json={"module": "reading", "message": "Question"}).status_code, 403)
        self.chat_generate.assert_not_called()

    def test_signed_in_student_chat_and_evaluation_have_real_output_shapes(self):
        response = self.client.post("/api/chat", headers=self.headers, json={"module": "reading", "message": "Question"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["reply"], "Tutor reply")
        self.assertEqual(self.chat_generate.call_args.args[1], "student")
        response = self.client.post("/api/evaluation", headers=self.headers, json={"module": "writing", "submission_text": "Answer"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["estimated_band"], 6)

    def test_quota_errors_keep_status_and_retry_after(self):
        self.chat_generate.side_effect = HTTPException(429, "Your daily limit is reached", headers={"Retry-After": "3600"})
        response = self.client.post("/api/chat", headers=self.headers, json={"module": "reading", "message": "Question"})
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["retry-after"], "3600")

    def test_oversized_and_invalid_requests_do_not_reach_generation(self):
        response = self.client.post("/api/chat", headers=self.headers, content=b"x" * 32769)
        self.assertEqual(response.status_code, 413)
        response = self.client.post("/api/chat", headers=self.headers, json={"module": "reading", "message": "x" * 8001})
        self.assertEqual(response.status_code, 422)
        self.chat_generate.assert_not_called()

    def test_bad_evaluation_shape_is_an_explicit_failure(self):
        self.eval_generate.return_value = '{"summary":"Test","estimated_band":99}'
        response = self.client.post("/api/evaluation", headers=self.headers, json={"module": "writing", "submission_text": "Answer"})
        self.assertEqual(response.status_code, 502)


class BenchmarkTests(unittest.TestCase):
    def results(self):
        return [
            {"provider": provider, "id": case["id"],
             "text": json.dumps({"question_metadata": {}, "options_status": [{"letter": case["answer"], "is_correct_choice": True}],
                                 "explanation_payload": {"main_explanation_html": "Grounded reason", "distractor_analysis": [{"reason": "Contrast"}]}}),
             "reviewer_correct": True, "reviewer_grounded": True,
             "latency_ms": 1000, "input_tokens": 1000, "output_tokens": 500}
            for provider in ("gemini", "deepseek") for case in CASES
        ]

    def test_complete_reviewed_results_pass_pilot_gate(self):
        self.assertTrue(evaluate(self.results())["passed"])

    def test_wrong_answers_unreviewed_outputs_and_slow_responses_fail(self):
        results = self.results()
        results[0]["reviewer_grounded"] = False
        results[1]["latency_ms"] = 30001
        results[2]["text"] = "{}"
        self.assertEqual(len(evaluate(results)["failures"]), 3)

    def test_missing_or_duplicate_cases_are_rejected(self):
        results = self.results()
        with self.assertRaises(ValueError):
            evaluate(results[:-1])
        with self.assertRaises(ValueError):
            evaluate(results + [results[0]])
