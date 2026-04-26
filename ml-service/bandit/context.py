import math
import numpy as np
from typing import Any


def context_to_vector(ctx: dict[str, Any]) -> np.ndarray:
    """
    Converts a ContextSnapshot dict (14 features) into a numpy feature vector.

    Feature order (must stay stable — bump FEATURE_SCHEMA_VERSION if changed):
      0-1  hour cyclical: sin(2π*hour/24), cos(2π*hour/24)
      2-3  day cyclical:  sin(2π*day/7),  cos(2π*day/7)
      4    energy_norm:   (energy_level - 1) / 4,  0.0 if null
      5    distraction_norm
      6    rolling_completion_rate           [0, 1]
      7    rolling_focus_rating_mean_norm:   (mean - 1) / 4
      8    rolling_fatigue_mean_norm:        (mean - 1) / 4,  0.0 if null
      9    ewm_reward                        [0, 1]
      10   streak_len_norm:                  min(streak / 14, 1.0)
      11   sessions_24h_norm:                min(count / 6, 1.0)
      12   last_duration_norm:               min(minutes / 55, 1.0),  0.0 if null
      13   time_since_last_norm:             min(hours / 24, 1.0),    0.0 if null
    """
    hour = float(ctx.get("hour_of_day") or 0)
    day  = float(ctx.get("day_of_week") or 0)

    energy = ctx.get("energy_level")
    distraction = ctx.get("distraction_level")
    fatigue_mean = ctx.get("rolling_fatigue_mean")
    last_duration = ctx.get("last_session_duration_min")
    time_since = ctx.get("time_since_last_session_hours")

    features = [
        math.sin(2 * math.pi * hour / 24),
        math.cos(2 * math.pi * hour / 24),
        math.sin(2 * math.pi * day / 7),
        math.cos(2 * math.pi * day / 7),
        (float(energy) - 1.0) / 4.0 if energy is not None else 0.0,
        (float(distraction) - 1.0) / 4.0 if distraction is not None else 0.0,
        float(ctx.get("rolling_completion_rate") or 0.0),
        (float(ctx.get("rolling_focus_rating_mean") or 3.0) - 1.0) / 4.0,
        (float(fatigue_mean) - 1.0) / 4.0 if fatigue_mean is not None else 0.0,
        float(ctx.get("ewm_reward") or 0.55),
        min(float(ctx.get("streak_length") or 0) / 14.0, 1.0),   # 14 = 2-week cycle cap
        min(float(ctx.get("sessions_last_24h") or 0) / 6.0, 1.0), # 6 = high-usage ceiling (>6 is unusual)
        min(float(last_duration) / 55.0, 1.0) if last_duration is not None else 0.0,  # 55 = longest arm (min)
        min(float(time_since) / 24.0, 1.0) if time_since is not None else 0.0,        # 24 = one full day cap
    ]

    return np.array(features, dtype=np.float64)
