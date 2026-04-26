from typing import Any


def compute_ips(events: list[dict[str, Any]]) -> float:
    """
    Inverse Propensity Scoring estimator.
    Each event must have: reward (float), propensity (float > 0), chosen (bool).
    IPS = Σ (reward * I[chosen]) / propensity / N
    """
    n = len(events)
    if n == 0:
        return 0.0

    total = 0.0
    for e in events:
        if e.get("chosen") and e.get("propensity", 0) > 0:
            total += e["reward"] / e["propensity"]

    return total / n


def compute_snips(events: list[dict[str, Any]]) -> float:
    """
    Self-Normalised IPS (Trotter & Ross). Reduces variance vs plain IPS.
    SNIPS = Σ (reward / propensity) / Σ (1 / propensity)
    """
    numerator = 0.0
    denominator = 0.0
    for e in events:
        if e.get("chosen") and e.get("propensity", 0) > 0:
            w = 1.0 / e["propensity"]
            numerator += e["reward"] * w
            denominator += w

    if denominator == 0:
        return 0.0
    return numerator / denominator


def compute_doubly_robust(events: list[dict[str, Any]], reward_model: Any) -> float:
    """
    Doubly-Robust estimator (Dudik et al., 2011).
    Requires reward_model.predict(ctx, focus_minutes, break_minutes, mode) -> float.
    DR = (1/N) Σ [ direct_pred + (reward - direct_pred) * I[chosen] / propensity ]

    Notes:
    - IPS on heuristic-only data (propensity=1.0) degenerates to direct estimation.
    - DR is unbiased if either the logging policy or the reward model is correct.
    """
    from bandit.arms import ARM_MAP

    n = len(events)
    if n == 0:
        return 0.0

    total = 0.0
    for e in events:
        ctx = e.get("context_snapshot") or {}
        arm_id = e.get("arm_id") or ""
        arm = ARM_MAP.get(arm_id)
        if arm is None:
            continue

        direct_pred = reward_model.predict(ctx, arm["focus_minutes"], arm["break_minutes"], arm["mode"])

        if e.get("chosen") and e.get("propensity", 0) > 0:
            residual = (e["reward"] - direct_pred) / e["propensity"]
        else:
            residual = 0.0

        total += direct_pred + residual

    return total / n
