import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

BUCKET_NAME = "model-artifacts"


class ArtifactStore:
    """Stores/retrieves model artifacts in Supabase Storage."""

    def upload(self, path: str, data: bytes) -> str | None:
        try:
            from storage.supabase_client import get_supabase
            supabase = get_supabase()
            supabase.storage.from_(BUCKET_NAME).upload(path, data, {"upsert": "true"})
            url = f"supabase://{BUCKET_NAME}/{path}"
            logger.info("Uploaded model artifact to %s", url)
            return url
        except Exception:
            logger.exception("Failed to upload artifact to %s", path)
            return None

    def download(self, path: str) -> bytes | None:
        try:
            from storage.supabase_client import get_supabase
            supabase = get_supabase()
            return supabase.storage.from_(BUCKET_NAME).download(path)
        except Exception:
            logger.exception("Failed to download artifact from %s", path)
            return None
