import unittest

from config import build_r2_endpoint, get_cors_allow_origins, settings


class ConfigTests(unittest.TestCase):
    def test_build_r2_endpoint(self):
        self.assertEqual(
            build_r2_endpoint("abc123"),
            "https://abc123.r2.cloudflarestorage.com",
        )

    def test_get_cors_allow_origins_parses_csv(self):
        original = settings.cors_allow_origins
        try:
            settings.cors_allow_origins = "https://a.test, https://b.test"
            self.assertEqual(get_cors_allow_origins(), ["https://a.test", "https://b.test"])
        finally:
            settings.cors_allow_origins = original


if __name__ == "__main__":
    unittest.main()
