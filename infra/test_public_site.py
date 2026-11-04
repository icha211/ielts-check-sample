import tempfile
import unittest
from pathlib import Path

from stage_public_site import is_public_asset, stage_public_site


class PublicArtifactTests(unittest.TestCase):
    def test_allowlist_excludes_backend_configuration_secrets_and_tests(self):
        for name in (
            ".env", "env.yaml", "firebase.json", "database.rules.json", "guide.md",
            "server.py", "debug.log", "apps/api-gateway/main.py", "api/runtime-config.js",
            "toefl-sample/.env", "toefl-sample/env.yaml", "toefl-sample/tutor.test.js",
            "node_modules/runtime.js", "toefl-sample/node_modules/runtime.js",
            "infra/beta/firebase-mock.js", "infra/playwright.config.cjs",
            "test-results/beta/trace.zip", "playwright-report/index.html",
        ):
            with self.subTest(name=name):
                self.assertFalse(is_public_asset(Path(name)))
        for name in ("index.html", "storage-sync.js", "toefl-sample/section 1.html", "asset/icon/logo.svg", "asst/font.woff2", "asset/figma/test-history-hero.png"):
            with self.subTest(name=name):
                self.assertTrue(is_public_asset(Path(name)))

    def test_staging_preserves_relative_urls_and_removes_stale_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {
                "index.html": "frontend",
                "toefl-sample/section 1.html": "course",
                "asset/icon/logo.svg": "image",
                "asset/figma/test-history-hero.png": "history image",
                "apps/api-gateway/env.yaml": "secret",
                "toefl-sample/env.yaml": "secret",
                ".env": "secret",
                "toefl-sample/tutor.test.js": "test",
                ".public-site/leaked.yaml": "stale",
            }
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(data)
            result = stage_public_site(root)
            actual = {p.relative_to(result).as_posix() for p in result.rglob("*") if p.is_file()}
            self.assertEqual(actual, {"index.html", "toefl-sample/section 1.html", "asset/icon/logo.svg", "asset/figma/test-history-hero.png"})
            self.assertEqual((result / "index.html").read_text(), "frontend")


if __name__ == "__main__":
    unittest.main()
