from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IELTS Check API Gateway"
    api_prefix: str = "/api"
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True

    model_config = SettingsConfigDict(
        env_prefix="IELTS_API_",
        env_file=".env",
        extra="ignore",
    )


settings = Settings()