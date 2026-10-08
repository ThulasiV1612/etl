"""Configuration for the onboarding fields Python service."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    fastapi_port: int = 5008
    flask_port: int = 5009
    cors_origins: str = "http://localhost:5173,http://localhost:5004"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
