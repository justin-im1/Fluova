import json
import logging
from typing import Any

from storage.supabase_client import get_supabase
from bandit.linucb import DisjointLinUCB, make_cold_start_bandit
from bandit.arms import ARM_IDS

logger = logging.getLogger(__name__)

MODEL_TYPE = "linucb_v1"
SAVE_INTERVAL = 10  # save every N updates


def load_bandit(default_alpha: float = 1.0) -> DisjointLinUCB:
    """Loads the most-recent LinUCB model from model_versions. Initialises fresh if none exists."""
    supabase = get_supabase()
    result = (
        supabase.table("model_versions")
        .select("id, metrics_payload")
        .eq("type", MODEL_TYPE)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if rows and rows[0].get("metrics_payload") and "arm_ids" in rows[0]["metrics_payload"]:
        try:
            bandit = DisjointLinUCB.from_dict(rows[0]["metrics_payload"])
            logger.info("Loaded LinUCB from DB (update_count=%d)", bandit.update_count)
            return bandit
        except Exception:
            logger.exception("Failed to deserialize bandit from DB — initialising fresh")

    logger.info("No bandit found in DB — initialising fresh cold-start bandit")
    return make_cold_start_bandit(ARM_IDS, alpha=default_alpha)


def save_bandit(bandit: DisjointLinUCB) -> None:
    """Persists bandit state to model_versions table."""
    supabase = get_supabase()
    try:
        supabase.table("model_versions").insert({
            "type": MODEL_TYPE,
            "feature_schema_version": "v1",
            "reward_version": "reward_v1",
            "metrics_payload": bandit.to_dict(),
        }).execute()
        logger.info("Saved LinUCB to DB (update_count=%d)", bandit.update_count)
    except Exception:
        logger.exception("Failed to save bandit to DB")


def should_save(bandit: DisjointLinUCB) -> bool:
    return bandit.update_count > 0 and bandit.update_count % SAVE_INTERVAL == 0
