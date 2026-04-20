from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    garmin_email: str
    garmin_password: str
    sync_interval_minutes: int = 30
    activities_per_sync: int = 100
    database_url: str = "sqlite:///./garmin_activities.db"
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
