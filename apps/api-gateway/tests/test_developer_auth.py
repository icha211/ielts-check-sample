import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from firebase_admin import auth as firebase_auth
from google.auth.exceptions import GoogleAuthError

import auth
from main import create_app
from routes import developer


KEY = "audio/listening/sets/test_set/part_1.mp3"
CLAIMS = {
    "uid": "developer-id",
    "role": "developer",
    "email": auth.DEVELOPER_EMAIL,
    "email_verified": True,
}


class DeveloperAuthorizationTests(unittest.TestCase):
    def test_health_is_available_directly_and_through_hosting_api_rewrite(self):
        client = TestClient(create_app())
        for path in ("/health", "/api/health"):
            response = client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"ok": True, "service": "api-gateway"})

    def test_default_cors_accepts_firebase_hosting_authenticated_requests(self):
        with patch("main.settings.cors_origins", None):
            client = TestClient(create_app())
        for origin in ("https://quickcheck-25590.web.app", "https://quickcheck-25590.firebaseapp.com"):
            response = client.options("/api/chat", headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["access-control-allow-origin"], origin)

    def setUp(self):
        self.client = TestClient(create_app())
        self.r2 = Mock()
        self.r2.generate_presigned_url.return_value = "https://upload.example/signed"
        self.storage = patch.object(developer, "_get_r2_client", return_value=self.r2).start()
        self.alignment = patch.object(developer, "_request_whisperx_alignment", return_value=None).start()
        self.urlopen = patch.object(developer.urllib.request, "urlopen").start()
        self.app = patch.object(auth, "_firebase_app", return_value=Mock()).start()
        self.verify = patch.object(auth.auth, "verify_id_token", return_value=CLAIMS.copy()).start()
        patch.object(developer, "reserve_generation").start()
        self.addCleanup(patch.stopall)

    def post(self, endpoint, headers=None, key=KEY):
        if endpoint == "upload-proxy":
            return self.client.post(
                "/api/developer/upload-proxy", headers=headers,
                data={"objectKey": key, "fileType": "audio/mpeg"},
                files={"file": ("part_1.mp3", b"audio-bytes", "audio/mpeg")},
            )
        bodies = {
            "upload-url": {"objectKey": key, "fileName": "part_1.mp3", "fileType": "audio/mpeg"},
            "ensure-audio-folder": {"setId": "test_set"},
            "align-transcript": {"audioUrl": "https://audio.example/test.mp3", "transcriptText": "Man: Hello"},
        }
        return self.client.post(f"/api/developer/{endpoint}", headers=headers, json=bodies[endpoint])

    def assert_blocked(self, status, headers):
        for endpoint in ("upload-url", "upload-proxy", "ensure-audio-folder", "align-transcript"):
            with self.subTest(endpoint=endpoint):
                response = self.post(endpoint, headers)
                self.assertEqual(response.status_code, status, response.text)
        self.storage.assert_not_called()
        self.alignment.assert_not_called()
        self.urlopen.assert_not_called()

    def test_missing_and_malformed_tokens_never_reach_storage_or_alignment(self):
        for value in (None, "Basic password", "Bearer", "Bearer "):
            with self.subTest(value=value):
                self.assert_blocked(401, {"Authorization": value} if value is not None else {})
        self.verify.assert_not_called()

    def test_invalid_expired_revoked_and_disabled_sessions_are_rejected(self):
        for error in (
            firebase_auth.InvalidIdTokenError("invalid"),
            firebase_auth.ExpiredIdTokenError("expired", cause=None),
            firebase_auth.RevokedIdTokenError("revoked"),
            firebase_auth.UserDisabledError("disabled"),
        ):
            with self.subTest(error=type(error).__name__):
                self.verify.side_effect = error
                self.assert_blocked(401, {"Authorization": "Bearer bad-token"})

    def test_student_teacher_unverified_and_wrong_email_are_forbidden(self):
        for changes in (
            {"role": None}, {"role": "teacher"}, {"role": "student"},
            {"email_verified": False}, {"email_verified": "true"},
            {"email": "other@example.com"},
        ):
            with self.subTest(changes=changes):
                self.verify.return_value = {**CLAIMS, **changes}
                self.assert_blocked(403, {"Authorization": "Bearer user-token"})

    def test_auth_service_failure_fails_closed(self):
        self.verify.side_effect = GoogleAuthError("service unavailable")
        self.assert_blocked(503, {"Authorization": "Bearer token"})

    def test_missing_project_configuration_fails_closed(self):
        with patch.object(auth, "_firebase_app", side_effect=auth.HTTPException(503, "Authentication is not configured")):
            self.assert_blocked(503, {"Authorization": "Bearer token"})
        self.verify.assert_not_called()

    def test_developer_presign_preserves_canonical_keys_and_checks_revocation(self):
        for key in (
            KEY,
            "audio/listening/sets/test_set/question_set/part_1/q_01.mp3",
            "audio/listening/sets/test_set/question_set/part_2/q_31-34.mp3",
            "audio/listening/sets/test_set/question_set/part_3/q_47-50.mp3",
        ):
            with self.subTest(key=key):
                response = self.post("upload-url", {"Authorization": "bEaReR valid-token"}, key)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["objectKey"], key)
                self.assertEqual(self.r2.generate_presigned_url.call_args.kwargs["Params"]["Key"], key)
        self.assertEqual(self.verify.call_args.args, ("valid-token",))
        self.assertTrue(self.verify.call_args.kwargs["check_revoked"])
        self.assertIs(self.verify.call_args.kwargs["app"], self.app.return_value)

    def test_developer_can_replace_existing_audio_and_create_folder(self):
        for _ in range(2):
            response = self.post("upload-proxy", {"Authorization": "Bearer valid-token"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["objectKey"], KEY)
            self.assertEqual(response.json()["size"], len(b"audio-bytes"))
            self.assertEqual(self.r2.put_object.call_args.kwargs["Key"], KEY)
        self.assertEqual(self.r2.put_object.call_count, 2)
        response = self.post("ensure-audio-folder", {"Authorization": "Bearer valid-token"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.r2.put_object.call_args.kwargs["Key"], "audio/listening/sets/test_set/.folder")

    def test_developer_alignment_is_still_available(self):
        self.urlopen.return_value.__enter__.return_value.read.return_value = b'{"segments": []}'
        with patch.object(developer.settings, "whisperx_aligner_url", "https://aligner.example"):
            response = self.post("align-transcript", {"Authorization": "Bearer valid-token"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {"provider": "whisperx", "segments": []})
        self.urlopen.assert_called_once()

    def test_developer_cannot_write_arbitrary_keys(self):
        for key in ("env.yaml", "../secret.mp3", "audio/listening/sets/test_set/part_4.mp3"):
            for endpoint in ("upload-url", "upload-proxy"):
                with self.subTest(key=key, endpoint=endpoint):
                    response = self.post(endpoint, {"Authorization": "Bearer valid-token"}, key)
                    self.assertEqual(response.status_code, 400, response.text)
        self.storage.assert_not_called()

    def test_public_audio_metadata_and_range_playback_remain_available(self):
        response = self.client.get("/api/developer/audio-url", params={"objectKey": KEY})
        self.assertEqual(response.status_code, 200)
        self.r2.get_object.return_value = {
            "Body": Mock(iter_chunks=Mock(return_value=iter([b"aud"]))),
            "ContentType": "audio/mpeg", "ContentLength": 3, "ContentRange": "bytes 0-2/11",
        }
        response = self.client.get(
            "/api/developer/audio-proxy", params={"objectKey": KEY}, headers={"Range": "bytes=0-2"},
        )
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response.content, b"aud")
        self.assertEqual(response.headers["content-range"], "bytes 0-2/11")
        self.verify.assert_not_called()


if __name__ == "__main__":
    unittest.main()
