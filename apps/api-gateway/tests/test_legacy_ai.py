import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException

import ai_runtime


ROOT = Path(__file__).resolve().parents[3]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


review = load("ai_review_server")
storage = load("data_storage_server")


class LegacyAiTests(unittest.TestCase):
    def handler(self, cls, body, path):
        handler = object.__new__(cls)
        data = json.dumps(body).encode()
        handler.headers = {"Content-Length": str(len(data)), "Authorization": "Bearer test"}
        handler.rfile = io.BytesIO(data)
        handler.connection = Mock()
        handler.path = path
        handler._send = Mock()
        handler._send_text = Mock()
        return handler

    def test_legacy_review_rejects_unsigned_requests_before_read_or_generation(self):
        handler = self.handler(review.Handler, {}, "/api/ai-review")
        with (
            patch.object(review, "require_signed_in", side_effect=HTTPException(401, "Sign in")),
            patch.object(review, "generate_text") as generate,
        ):
            handler.do_POST()
        handler._send.assert_called_once_with(401, {"error": "Sign in"})
        self.assertEqual(handler.rfile.tell(), 0)
        generate.assert_not_called()

    def test_legacy_review_keeps_quota_error_status_and_clears_identity(self):
        handler = self.handler(review.Handler, {"module": "writing"}, "/api/ai-review")
        with (
            patch.object(review, "require_signed_in", return_value={"uid": "student"}),
            patch.object(review, "generate_text", side_effect=HTTPException(429, "Daily limit")),
        ):
            handler.do_POST()
        handler._send.assert_called_once_with(429, {"error": "Daily limit"})
        self.assertIsNone(ai_runtime.current_ai_uid.get())

    def test_legacy_review_provider_has_current_authenticated_identity(self):
        handler = self.handler(review.Handler, {"module": "writing"}, "/api/ai-review")
        def generate(prompt):
            self.assertEqual(ai_runtime.current_ai_uid.get(), "student")
            return '{"summary":"Feedback","estimatedBand":"6","strengths":[],"improvements":[],"nextSteps":[]}'
        with (
            patch.object(review, "require_signed_in", return_value={"uid": "student"}),
            patch.object(review, "generate_text", side_effect=generate),
        ):
            handler.do_POST()
        self.assertEqual(handler._send.call_args.args[0], 200)
        self.assertIsNone(ai_runtime.current_ai_uid.get())

    def test_legacy_review_rejects_oversized_body_before_generation(self):
        handler = self.handler(review.Handler, {}, "/api/ai-review")
        handler.headers["Content-Length"] = str(32769)
        with patch.object(review, "require_signed_in", return_value={"uid": "student"}):
            handler.do_POST()
        self.assertEqual(handler._send.call_args.args[0], 413)
        self.assertEqual(handler.rfile.tell(), 0)

    def test_both_transcription_actions_require_authentication(self):
        for action in ("transcribe-audio", "transcribe-audio-bytes"):
            handler = self.handler(storage.StorageHandler, {"action": action, "setId": "one", "audioData": "eA=="}, "/api/problems")
            with (
                patch.object(storage, "require_signed_in", side_effect=HTTPException(401, "Sign in")),
                patch.object(storage, "generate_audio") as generate,
            ):
                handler.do_POST()
            handler._send.assert_called_once_with(401, {"error": "Sign in"})
            generate.assert_not_called()

    def test_transcription_passes_user_identity_and_preserves_quota_status(self):
        handler = self.handler(storage.StorageHandler, {"action": "transcribe-audio-bytes", "audioData": "eA=="}, "/api/problems")
        with (
            patch.object(storage, "require_signed_in", return_value={"uid": "student"}),
            patch.object(storage, "generate_audio", side_effect=HTTPException(429, "Daily limit")) as generate,
        ):
            handler.do_POST()
        self.assertEqual(generate.call_args.args[-1], "student")
        handler._send.assert_called_once_with(429, {"error": "Daily limit"})


if __name__ == "__main__":
    unittest.main()
