from typing import Any
import numpy as np

MODE_ENCODING = {"recovery": 0, "standard": 1, "deep": 2}


def build_xgb_features(ctx: dict[str, Any], focus_minutes: int, break_minutes: int, mode: str) -> np.ndarray:
    """
    Builds the full feature vector for the XGBoost reward predictor.
    Combines all context_snapshot fields with action features.
    """
    energy = ctx.get("energy_level")
    distraction = ctx.get("distraction_level")
    fatigue_mean = ctx.get("rolling_fatigue_mean")
    last_duration = ctx.get("last_session_duration_min")
    time_since = ctx.get("time_since_last_session_hours")

    features = [
        float(ctx.get("hour_of_day") or 0),
        float(ctx.get("day_of_week") or 0),
        float(energy) if energy is not None else 3.0,
        float(distraction) if distraction is not None else 3.0,
        float(ctx.get("rolling_completion_rate") or 0.5),
        float(ctx.get("rolling_focus_rating_mean") or 3.0),
        float(fatigue_mean) if fatigue_mean is not None else 3.0,
        float(ctx.get("ewm_reward") or 0.55),
        float(ctx.get("streak_length") or 0),
        float(ctx.get("sessions_last_24h") or 0),
        float(ctx.get("sessions_last_7d") or 0),
        float(last_duration) if last_duration is not None else 30.0,
        float(time_since) if time_since is not None else 8.0,
        float(ctx.get("last_session_completed") or False),
        # Action features
        float(focus_minutes),
        float(break_minutes),
        float(MODE_ENCODING.get(mode, 1)),
    ]

    return np.array(features, dtype=np.float64)


FEATURE_NAMES = [
    "hour_of_day", "day_of_week", "energy_level", "distraction_level",
    "rolling_completion_rate", "rolling_focus_rating_mean", "rolling_fatigue_mean",
    "ewm_reward", "streak_length", "sessions_last_24h", "sessions_last_7d",
    "last_session_duration_min", "time_since_last_session_hours", "last_session_completed",
    "focus_minutes", "break_minutes", "mode_encoded",
]
