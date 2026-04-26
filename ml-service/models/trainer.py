import logging
from datetime import datetime, timezone
from typing import Any

import numpy as np

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

from models.feature_builder import build_xgb_features, FEATURE_NAMES
from storage.supabase_client import get_supabase
from storage.artifact_store import ArtifactStore

logger = logging.getLogger(__name__)


class TrainingResult:
    def __init__(self, model_version_id: str, metrics: dict[str, float]) -> None:
        self.model_version_id = model_version_id
        self.metrics = metrics


def train_reward_predictor(
    start_date: str | None = None,
    end_date: str | None = None,
    reward_version: str = "reward_v1",
    min_samples: int = 50,
) -> TrainingResult | None:
    if not XGB_AVAILABLE:
        logger.warning("XGBoost not available — training skipped")
        return None

    supabase = get_supabase()
    now = datetime.now(timezone.utc)

    if start_date == "auto" or start_date is None:
        # Default: last 90 days
        from datetime import timedelta
        start_date = (now - timedelta(days=90)).isoformat()
    if end_date == "auto" or end_date is None:
        end_date = now.isoformat()

    # Load sessions with reward and context
    result = (
        supabase.table("sessions")
        .select("id, reward_value, reward_version, focus_duration_sec, session_type, recommendation_event_id")
        .not_is("reward_value", "null")
        .eq("reward_version", reward_version)
        .gte("started_at", start_date)
        .lte("started_at", end_date)
        .execute()
    )
    sessions = result.data or []

    if len(sessions) < min_samples:
        logger.warning("Not enough samples (%d < %d) — training skipped", len(sessions), min_samples)
        return None

    # Load matching recommendation_events for context snapshots
    rec_event_ids = [s["recommendation_event_id"] for s in sessions if s.get("recommendation_event_id")]
    rec_result = (
        supabase.table("recommendation_events")
        .select("id, context_snapshot, session_mode")
        .in_("id", rec_event_ids)
        .execute()
    )
    rec_map: dict[str, dict] = {r["id"]: r for r in (rec_result.data or [])}

    rows: list[tuple[np.ndarray, float]] = []
    for s in sessions:
        rec = rec_map.get(s.get("recommendation_event_id") or "")
        if rec is None or not rec.get("context_snapshot"):
            continue
        ctx = rec["context_snapshot"]
        focus_min = round(s["focus_duration_sec"] / 60)
        break_min = 5
        mode = rec.get("session_mode") or "standard"
        x = build_xgb_features(ctx, focus_min, break_min, mode)
        rows.append((x, float(s["reward_value"])))

    if len(rows) < min_samples:
        logger.warning("Not enough matched rows (%d) — training skipped", len(rows))
        return None

    # Chronological 80/20 split
    split = int(len(rows) * 0.8)
    X_train = np.array([r[0] for r in rows[:split]])
    y_train = np.array([r[1] for r in rows[:split]])
    X_val   = np.array([r[0] for r in rows[split:]])
    y_val   = np.array([r[1] for r in rows[split:]])

    model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        feature_names=FEATURE_NAMES,
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)

    preds = model.predict(X_val)
    mae  = float(np.mean(np.abs(preds - y_val)))
    rmse = float(np.sqrt(np.mean((preds - y_val) ** 2)))
    ss_res = float(np.sum((preds - y_val) ** 2))
    ss_tot = float(np.sum((y_val - np.mean(y_val)) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

    metrics = {"mae": mae, "rmse": rmse, "r2": r2, "n_train": len(X_train), "n_val": len(X_val)}
    logger.info("XGBoost training complete: %s", metrics)

    # Save model artifact
    artifact_store = ArtifactStore()
    timestamp = now.strftime("%Y%m%d_%H%M%S")
    artifact_path = f"xgboost_v1/{timestamp}.json"
    artifact_uri: str | None = None
    try:
        model_bytes = model.save_model(to_buffer=True)  # type: ignore[attr-defined]
        artifact_uri = artifact_store.upload(artifact_path, model_bytes)
    except Exception:
        logger.exception("Failed to upload model artifact")

    # Write model_versions row
    mv_result = (
        supabase.table("model_versions")
        .insert({
            "type": "xgboost_v1",
            "feature_schema_version": "v1",
            "reward_version": reward_version,
            "training_window": {"start": start_date, "end": end_date},
            "metrics_payload": metrics,
            "artifact_uri": artifact_uri,
        })
        .execute()
    )
    version_id: str = mv_result.data[0]["id"] if mv_result.data else "unknown"
    return TrainingResult(model_version_id=version_id, metrics=metrics)
