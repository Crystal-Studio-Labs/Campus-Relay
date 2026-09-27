"""Application configuration.

All settings are environment-driven; nothing secret is hardcoded.
See backend/.env.example for the full list.
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalise_database_url(url: str) -> str:
    """Point any Postgres URL at the psycopg 3 driver.

    Hosted Postgres providers (Supabase, Neon, Render, Railway) hand you a
    connection string beginning ``postgres://`` or ``postgresql://``. SQLAlchemy
    needs an explicit driver, so both are rewritten to ``postgresql+psycopg://``.
    Query parameters such as ``?sslmode=require`` are preserved untouched, which
    is what Supabase requires from an external host.
    """
    for scheme in ("postgresql+psycopg://", "postgresql+asyncpg://"):
        if url.startswith(scheme):
            return url
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core ---
    app_name: str = "Campus Relay"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"

    # --- Security ---
    app_secret_key: str = Field(default="dev-only-change-me", min_length=8)
    access_token_expire_minutes: int = 720
    jwt_algorithm: str = "HS256"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Database ---
    postgres_user: str = "campus"
    postgres_password: str = "campus"
    postgres_db: str = "campus_relay"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url: str | None = None
    db_echo: bool = False
    # Connection pool. Supabase's free tier caps concurrent connections, so a
    # hosted deployment often wants these smaller than a local install.
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_pre_ping: bool = True

    # --- Intelligence layer ---
    # "rules" (default) = deterministic local engines, zero network calls.
    # "openai_compatible" = real LLM behind the same tool/authorization pipeline.
    agent_provider: str = "rules"
    agent_llm_base_url: str = ""
    agent_llm_api_key: str = ""
    agent_llm_model: str = ""
    agent_timeout_seconds: float = 20.0

    # --- Push notifications (optional) ---
    # Web push needs a provider and a VAPID key pair. When these are empty the
    # push channel reports itself as not configured rather than pretending to
    # deliver - see app/services/notifications.py.
    push_provider_url: str = ""
    push_vapid_public_key: str = ""
    push_vapid_private_key: str = ""
    push_subject: str = ""

    @property
    def push_configured(self) -> bool:
        return bool(self.push_provider_url and self.push_vapid_public_key and self.push_vapid_private_key)

    # --- Telegram (real, low-friction external channel) ---
    # A bot token from @BotFather is all that is needed; there is no business
    # verification and no message-template approval. Users link a chat id.
    telegram_bot_token: str = ""
    telegram_api_base: str = "https://api.telegram.org"

    @property
    def telegram_configured(self) -> bool:
        return bool(self.telegram_bot_token.strip())

    # --- WhatsApp (Meta Cloud API; needs a business account + approved template) ---
    # The adapter is real, but it stays honest about being unconfigured until a
    # phone-number id, a permanent token and an approved template exist.
    whatsapp_phone_number_id: str = ""
    whatsapp_token: str = ""
    whatsapp_template: str = ""
    whatsapp_template_language: str = "en"
    whatsapp_api_base: str = "https://graph.facebook.com"
    whatsapp_api_version: str = "v21.0"

    @property
    def whatsapp_configured(self) -> bool:
        return bool(self.whatsapp_phone_number_id.strip() and self.whatsapp_token.strip())

    # Public base URL of this deployment. Required for external channels to send
    # a notice attachment, because Meta/Telegram fetch the media by URL. Empty
    # means media cannot leave the building and the channels say so.
    public_base_url: str = ""

    # --- Outbound delivery worker (drains the notification outbox) ---
    # Off in tests so a run is deterministic; on in every real deployment.
    delivery_worker_enabled: bool = True
    delivery_poll_seconds: float = 10.0
    delivery_batch_size: int = 25
    delivery_timeout_seconds: float = 8.0

    # --- Institution template ---
    # The one file a college edits: name, design language, vocabulary, station
    # behaviour, feature switches. Empty means config/institution.json at the
    # repository root. See docs/specifications/CONFIGURATION.md and app/core/institution.py.
    institution_config_path: str = ""

    # --- Storage ---
    media_root: str = "media"
    max_upload_bytes: int = 5 * 1024 * 1024

    # --- Rate limiting (in-process, best effort) ---
    rate_limit_per_minute: int = 240

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return normalise_database_url(self.database_url)
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_demo_mode(self) -> bool:
        """Demo deployments expose the reset endpoint and demo credentials."""
        return self.app_env in {"development", "demo", "test"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
