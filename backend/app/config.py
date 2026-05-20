from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    data_dir: str = str(Path.home() / ".tally")
    sqlite_path: str = ""
    duckdb_path: str = ""
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:32b"
    ollama_fast_model: str = "qwen2.5:7b"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    upload_dir: str = ""
    backups_dir: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def model_post_init(self, __context) -> None:
        data = Path(self.data_dir)
        data.mkdir(parents=True, exist_ok=True)
        (data / "uploads").mkdir(exist_ok=True)
        (data / "backups").mkdir(exist_ok=True)
        if not self.sqlite_path:
            self.sqlite_path = str(data / "tally.db")
        if not self.duckdb_path:
            self.duckdb_path = str(data / "tally.duckdb")
        if not self.upload_dir:
            self.upload_dir = str(data / "uploads")
        if not self.backups_dir:
            self.backups_dir = str(data / "backups")


settings = Settings()
