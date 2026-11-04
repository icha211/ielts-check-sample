"""Opt-in live checks using disposable accounts; never run this in CI."""

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import uuid


PROJECT = "quickcheck-25590"
AUTH_API = f"https://identitytoolkit.googleapis.com/v1/projects/{PROJECT}"
DB = f"https://{PROJECT}-default-rtdb.asia-southeast1.firebasedatabase.app"
GATEWAY = "https://ielts-api-gateway-753959270698.asia-southeast1.run.app"


def request(url, method="GET", body=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        if url.startswith(AUTH_API):
            headers["X-Goog-User-Project"] = PROJECT
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = Request(url, method=method, headers=headers,
                  data=json.dumps(body).encode() if body is not None else None)
    try:
        response = urlopen(req, timeout=30)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Authorize disposable live account/data creation")
    args = parser.parse_args()
    if not args.execute:
        parser.error("--execute is required; this script temporarily writes live synthetic records")
    admin = os.environ.pop("BETA_ADMIN_TOKEN", "")
    if not admin:
        raise RuntimeError("BETA_ADMIN_TOKEN must be provided in the process environment; never pass tokens as arguments")
    root = Path(__file__).resolve().parents[1]
    config = (root / "toefl-sample" / "js" / "firebase-config.js").read_text()
    api_key = re.search(r'apiKey:\s*"([^"]+)"', config).group(1)
    run_id = "beta-check-" + uuid.uuid4().hex
    accounts = []
    cleanup_paths = []
    failures = []

    def check(label, actual, expected):
        ok = actual == expected
        print(json.dumps({"check": label, "result": "PASS" if ok else "FAIL",
                          "actual": actual, "expected": expected}))
        if not ok:
            failures.append(label)
        return ok

    def admin_db(path, method="GET", body=None):
        return request(f"{DB}/{path}.json", method, body, admin)

    def client_db(path, token, method="GET", body=None):
        query = urlencode({"auth": token})
        return request(f"{DB}/{path}.json?{query}", method, body)

    try:
        status, rules = admin_db(".settings/rules")
        if status != 200:
            raise RuntimeError(f"Cannot inspect deployed RTDB rules (HTTP {status}); no accounts created")
        local_rules = json.loads((root / "database.rules.json").read_text())
        check("Deployed RTDB rules match repository", rules == local_rules, True)
        # Verify the actual serving revision before an authenticated request could incur AI cost.
        status, service = request(
            f"https://run.googleapis.com/v1/projects/{PROJECT}/locations/asia-southeast1/services/ielts-api-gateway",
            token=admin)
        if status != 200:
            raise RuntimeError(f"Cannot verify live AI disable flag (HTTP {status}); no accounts created")
        revision = service.get("status", {}).get("latestReadyRevisionName")
        traffic = service.get("status", {}).get("traffic", [])
        env = service.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0].get("env", [])
        enabled = next((item.get("value") for item in env if item["name"] == "IELTS_API_AI_ENABLED"), None)
        if enabled != "false" or not revision or not traffic or any(
            item.get("percent", 0) > 0 and item.get("revisionName") != revision for item in traffic
        ):
            raise RuntimeError("All live traffic must use the verified AI-disabled revision; no accounts created")
        check("Live gateway AI flag is disabled", enabled, "false")
        identities = {}
        for role in ("teacher", "other-teacher", "student"):
            uid = f"{run_id}-{role}"
            email = f"{uid}@example.test"
            password = secrets.token_urlsafe(32)
            accounts.append(uid)
            cleanup_paths.extend(f"{node}/{uid}" for node in (
                "tutor_roles", "users", "user_test_history", "tutor_profiles",
                "tutor_public_teachers", "tutor_library"))
            status, created = request(AUTH_API + "/accounts", "POST", {
                "localId": uid, "email": email, "password": password,
                "emailVerified": True, "displayName": "Temporary Beta Check",
            }, admin)
            if status != 200 or created.get("localId") != uid:
                reason = created.get("error", {}).get("status", "unknown")
                raise RuntimeError(f"Cannot create synthetic {role} account (HTTP {status}, {reason})")
            status, session = request(
                "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?" + urlencode({"key": api_key}),
                "POST", {"email": email, "password": password, "returnSecureToken": True})
            if status != 200 or not session.get("idToken"):
                raise RuntimeError(f"Synthetic {role} login failed (HTTP {status})")
            identities[role] = (uid, session["idToken"])
            check(f"{role} real Firebase password login", status, 200)
        teacher, teacher_token = identities["teacher"]
        other, other_token = identities["other-teacher"]
        student, student_token = identities["student"]
        for role, (uid, token) in identities.items():
            status, _ = client_db(f"tutor_roles/{uid}", token, "PUT", "student" if role == "student" else "teacher")
            check(f"{role} self-service marketplace role", status, 200)
        status, _ = client_db(f"tutor_roles/{teacher}", student_token, "PUT", "student")
        check("Student cannot change another account role", status, 401)
        status, _ = client_db(f"tutor_roles/{student}", student_token, "PUT", "developer")
        check("Marketplace role cannot grant developer access", status, 401)

        course_path = f"tutor_courses/{run_id}"
        cleanup_paths.append(course_path)
        cleanup_paths.append(f"tutor_course_stats/{run_id}")
        course = {
            "teacherId": teacher, "teacherName": "Temporary Beta Check",
            "title": "Temporary beta validation - not a real course",
            "summary": "Synthetic validation record; removed immediately.",
            "whatYouLearn": "Synthetic outcome", "curriculum": "Synthetic lesson",
            "schedule": "Not available", "category": "listening", "type": "self",
            "price": 0, "originalPrice": 0, "coverURL": "", "previewURL": "",
            "previewPath": "", "previewType": "", "published": False,
            "archived": False, "createdAt": {".sv": "timestamp"}, "updatedAt": {".sv": "timestamp"},
        }
        status, saved = client_db(course_path, teacher_token, "PUT", course)
        if check("Teacher creates an unpublished course", status, 200):
            status, _ = client_db(course_path, other_token, "PATCH", {"title": "Unauthorized edit", "updatedAt": {".sv": "timestamp"}})
            check("Other teacher cannot edit the course", status, 401)
            status, _ = client_db(course_path, student_token, "PATCH", {"title": "Unauthorized edit", "updatedAt": {".sv": "timestamp"}})
            check("Student cannot edit the course", status, 401)
            status, _ = client_db(course_path, teacher_token, "PATCH", {"title": "Updated synthetic course", "updatedAt": {".sv": "timestamp"}})
            check("Owner updates the course", status, 200)
            status, saved = client_db(course_path, teacher_token)
            check("Owner course update persisted", saved.get("title") if status == 200 else status, "Updated synthetic course")
            status, _ = client_db(course_path, teacher_token, "PATCH", {"archived": True, "published": False, "updatedAt": {".sv": "timestamp"}})
            check("Owner archives without hard-deleting course", status, 200)

        history = f"user_test_history/{student}/{run_id}"
        attempt = {"id": run_id, "sectionKey": "structure", "testType": "practicetest",
                   "rawScore": 1, "totalQuestions": 1, "recordedAt": "2026-11-03T06:00:00Z"}
        status, _ = client_db(history, student_token, "PUT", attempt)
        check("Student saves own synthetic history", status, 200)
        status, saved = client_db(history, student_token)
        check("Student history survives readback", saved, attempt)
        for label, token in (("Teacher", teacher_token), ("Other teacher", other_token)):
            status, _ = client_db(history, token)
            check(f"{label} cannot read student history", status, 401)
            status, _ = client_db(history, token, "PUT", attempt)
            check(f"{label} cannot overwrite student history", status, 401)
        status, _ = request(f"{DB}/{history}.json")
        check("Signed-out client cannot read student history", status, 401)
        status, body = request(GATEWAY + "/api/chat", "POST", {
            "module": "reading", "message": "Synthetic AI-disabled validation",
        }, student_token)
        check("Registered account reaches disabled-AI guard", status, 503)
        check("AI denial is disabled guard, not auth infrastructure failure",
              body.get("detail"), "AI is temporarily disabled")
        status, _ = request(GATEWAY + "/api/developer/upload-url", "POST", {
            "objectKey": f"audio/{run_id}.mp3", "fileName": "synthetic.mp3", "fileType": "audio/mpeg",
        }, teacher_token)
        check("Teacher account does not grant developer upload access", status, 403)
    finally:
        cleanup_errors = []
        # Remove only this run's exact identifiers; never enumerate or delete live collections.
        for path in cleanup_paths:
            try:
                status, _ = admin_db(path, "DELETE")
                if status != 200:
                    cleanup_errors.append(f"{path}: HTTP {status}")
            except (OSError, ValueError) as error:
                cleanup_errors.append(f"{path}: {type(error).__name__}")
        for uid in accounts:
            try:
                status, _ = request(AUTH_API + "/accounts:delete", "POST", {"localId": uid}, admin)
                lookup_status, lookup = request(AUTH_API + "/accounts:lookup", "POST", {"localId": [uid]}, admin)
                if status != 200 and (lookup_status != 200 or lookup.get("users")):
                    cleanup_errors.append(f"account {uid}: HTTP {status}")
            except (OSError, ValueError) as error:
                cleanup_errors.append(f"account {uid}: {type(error).__name__}")
        time.sleep(5)
        for path in cleanup_paths:
            try:
                status, value = admin_db(path)
                if status != 200 or value is not None:
                    cleanup_errors.append(f"{path}: cleanup not confirmed")
            except (OSError, ValueError) as error:
                cleanup_errors.append(f"{path}: verification {type(error).__name__}")
        for uid in accounts:
            status, value = request(AUTH_API + "/accounts:lookup", "POST", {"localId": [uid]}, admin)
            if status != 200 or value.get("users"):
                cleanup_errors.append(f"account {uid}: deletion not confirmed")
        if cleanup_errors:
            raise RuntimeError("Synthetic cleanup requires attention: " + "; ".join(cleanup_errors))
        print("Synthetic account and database cleanup verified.")
    if failures:
        raise RuntimeError("Live checks failed: " + ", ".join(failures))


if __name__ == "__main__":
    main()
