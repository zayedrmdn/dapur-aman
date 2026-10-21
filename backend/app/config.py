"""Application configuration loaded from environment variables."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from backend root
backend_dir = Path(__file__).resolve().parent.parent
env_path = backend_dir / ".env"
load_dotenv(dotenv_path=env_path)

# AI Provider Settings
AI_PROVIDER = os.getenv("AI_PROVIDER", "vertex")
AI_MODEL = os.getenv("AI_MODEL", "gemini-3.8-flash")
GOOGLE_GENAI_USE_VERTEXAI = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "TRUE")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "hackathon-primestep-08")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "global")

# Neon Postgres Settings
# Ensure postgresql+psycopg driver is specified for psycopg v3
raw_db_url = os.getenv("DATABASE_URL", "")
if raw_db_url.startswith("postgresql://"):
    DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+psycopg://", 1)
else:
    DATABASE_URL = raw_db_url

raw_db_unpooled = os.getenv("DATABASE_URL_UNPOOLED", "")
if raw_db_unpooled.startswith("postgresql://"):
    DATABASE_URL_UNPOOLED = raw_db_unpooled.replace("postgresql://", "postgresql+psycopg://", 1)
else:
    DATABASE_URL_UNPOOLED = raw_db_unpooled

# Neon Object Storage (S3-compatible)
STORAGE_ENDPOINT = os.getenv("STORAGE_ENDPOINT", "")
STORAGE_REGION = os.getenv("STORAGE_REGION", "ap-southeast-1")
STORAGE_BUCKET = os.getenv("STORAGE_BUCKET", "food-photos")
STORAGE_ACCESS_KEY_ID = os.getenv("STORAGE_ACCESS_KEY_ID", "")
STORAGE_SECRET_ACCESS_KEY = os.getenv("STORAGE_SECRET_ACCESS_KEY", "")

# Server-to-server shared secret
BACKEND_SHARED_SECRET = os.getenv("BACKEND_SHARED_SECRET", "Wg7hs2QnIvklqwcalp_kIZKUkh-RfJ-4MyxrQ0LV6-s")
