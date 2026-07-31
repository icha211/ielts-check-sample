from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IELTS Check API Gateway"
    api_prefix: str = "/api"
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True
    cors_origins: str | None = Field(default=None, validation_alias="IELTS_API_CORS_ORIGINS")

    r2_account_id: str | None = Field(default=None, validation_alias="R2_ACCOUNT_ID")
    r2_bucket_name: str | None = Field(default=None, validation_alias="R2_BUCKET_NAME")
    r2_access_key_id: str | None = Field(default=None, validation_alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str | None = Field(default=None, validation_alias="R2_SECRET_ACCESS_KEY")
    r2_public_base_url: str | None = Field(default=None, validation_alias="R2_PUBLIC_BASE_URL")
    r2_region_name: str = Field(default="auto", validation_alias="R2_REGION_NAME")
    r2_presign_expire_seconds: int = Field(default=900, validation_alias="R2_PRESIGN_EXPIRE_SECONDS")
    r2_read_expire_seconds: int = Field(default=3600, validation_alias="R2_READ_EXPIRE_SECONDS")

    model_config = SettingsConfigDict(
        env_prefix="IELTS_API_",
        env_file=".env",
        extra="ignore",
    )


settings = Settings()


def build_r2_endpoint(account_id: str) -> str:
    return f"https://{account_id}.r2.cloudflarestorage.com"


def parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return []

    origins = []
    for value in raw.split(","):
        origin = value.strip().rstrip("/")
        if origin:
            origins.append(origin)
    return origins