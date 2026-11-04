from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from stage_public_site import is_public_asset


ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if urlsplit(self.path).path == "/__beta_health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"Local beta server ready")
            return
        source = Path(self.translate_path(self.path)).resolve()
        try:
            relative = source.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return
        if not is_public_asset(relative) or not source.is_file():
            self.send_error(404)
            return
        super().do_GET()

    def log_request(self, code="-", size="-"):
        if isinstance(code, int) and code >= 400:
            super().log_request(code, size)

    def do_HEAD(self):
        self.send_error(405, "Only GET is supported by the local beta server")


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 9460), Handler).serve_forever()
