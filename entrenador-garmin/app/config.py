from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    garmin_email: str
    garmin_password: str
    database_url: str = "sqlite:///./entrenador.db"
    log_level: str = "INFO"
    host: str = "0.0.0.0"
    port: int = 8000

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
