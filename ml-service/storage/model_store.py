import json
import logging
from typing import Any

from storage.supabase_client import get_supabase
from bandit.linucb import DisjointLinUCB, make_cold_start_bandit, FEATURE_SCHEMA_VERSION
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
        metrics = rows[0]["metrics_payload"]
        if metrics.get("feature_schema_version") != FEATURE_SCHEMA_VERSION:
            logger.warning(
                "Feature schema version mismatch (stored=%s expected=%s) — using fresh cold-start bandit",
                metrics.get("feature_schema_version"), FEATURE_SCHEMA_VERSION,
            )
            return make_cold_start_bandit(ARM_IDS, alpha=default_alpha)
        try:
            bandit = DisjointLinUCB.from_dict(metrics)
            logger.info("Loaded LinUCB from DB (update_count=%d)", bandit.update_count)
            return bandit
        except Exception:
            logger.exception("Failed to deserialize bandit from DB — initialising fresh")

    logger.info("No bandit found in DB — initialising fresh cold-start bandit")
    return make_cold_start_bandit(ARM_IDS, alpha=default_alpha)


MODEL_RETENTION = 20  # keep the most recent N snapshots

def save_bandit_dict(snapshot: dict) -> None:
    """Persists a pre-built bandit snapshot dict to model_versions. Safe to call from a thread."""
    supabase = get_supabase()
    try:
        supabase.table("model_versions").insert({
            "type": MODEL_TYPE,
            "feature_schema_version": "v1",
            "reward_version": "reward_v1",
            "metrics_payload": snapshot,
        }).execute()
        logger.info("Saved LinUCB to DB (update_count=%d)", snapshot.get("update_count", "?"))

        # Prune old snapshots — keep only the most recent MODEL_RETENTION rows.
        recent = (
            supabase.table("model_versions")
            .select("id")
            .eq("type", MODEL_TYPE)
            .order("created_at", desc=True)
            .limit(MODEL_RETENTION)
            .execute()
        )
        keep_ids = [r["id"] for r in (recent.data or [])]
        if len(keep_ids) == MODEL_RETENTION:
            supabase.table("model_versions").delete().eq("type", MODEL_TYPE).not_.in_("id", keep_ids).execute()
    except Exception:
        logger.exception("Failed to save bandit to DB")


def save_bandit(bandit: DisjointLinUCB) -> None:
    """Convenience wrapper — callers inside async handlers should prefer save_bandit_dict."""
    save_bandit_dict(bandit.to_dict())


def should_save(bandit: DisjointLinUCB) -> bool:
    return bandit.update_count > 0 and bandit.update_count % SAVE_INTERVAL == 0
