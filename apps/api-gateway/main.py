from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import parse_cors_origins, settings
from routes.chat import router as chat_router
from routes.evaluation import router as evaluation_router
from routes.health import router as health_router
from routes.developer import router as developer_router


DEFAULT_ALLOWED_ORIGINS = [
    "https://icha211.github.io",
    "http://localhost:3000",
    "http://localhost:8000",
]


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    allowed_origins = parse_cors_origins(settings.cors_origins)
    if not allowed_origins:
        allowed_origins = DEFAULT_ALLOWED_ORIGINS

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Range", "X-Playback-Telemetry"],
        expose_headers=["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type"],
    )

    app.include_router(health_router)
    app.include_router(chat_router, prefix=settings.api_prefix)
    app.include_router(evaluation_router, prefix=settings.api_prefix)
    app.include_router(developer_router, prefix=settings.api_prefix)

    return app


app = create_app()