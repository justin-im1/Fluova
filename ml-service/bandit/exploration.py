import math


def apply_safe_exploration(
    ucb_scores: dict[str, float],
    top_k: int = 4,
    min_plausibility: float = 0.3,
    user_session_count: int = 0,
    alpha_decay_factor: float = 0.95,
    base_epsilon: float = 0.2,
) -> tuple[list[str], float]:
    """
    Returns (eligible_arm_ids, epsilon) for ε-greedy exploration.

    Eligible arms are those within min_plausibility × score_range of the best score.
    Epsilon decays as the user accumulates sessions past 20.
    """
    if not ucb_scores:
        return [], 0.0

    max_score = max(ucb_scores.values())
    # Use an absolute gap from the best score so the threshold works correctly
    # regardless of sign (multiplicative scaling inverts for negative scores).
    score_range = max_score - min(ucb_scores.values())
    gap_threshold = min_plausibility * score_range

    sorted_arms = sorted(ucb_scores.keys(), key=lambda a: ucb_scores[a], reverse=True)
    eligible = [a for a in sorted_arms[:top_k] if max_score - ucb_scores[a] <= gap_threshold]

    if not eligible:
        eligible = [sorted_arms[0]]

    # Decay exploration as user gains experience beyond 20 sessions
    decay_steps = max(0, (user_session_count - 20) // 10)
    effective_epsilon = base_epsilon * (alpha_decay_factor ** decay_steps)

    # Minimal exploration floor
    effective_epsilon = max(effective_epsilon, 0.02)

    # No point exploring if only one eligible arm
    if len(eligible) == 1:
        effective_epsilon = 0.0

    return eligible, effective_epsilon


def cold_start_alpha(base_alpha: float, session_count: int, threshold: int = 10) -> float:
    """Decays alpha from 2×base toward base over the first threshold sessions."""
    session_count = max(0, session_count)
    if session_count >= threshold:
        return base_alpha
    t = session_count / threshold
    return base_alpha * (2.0 - t)


def select_cold_start_default(arm_ids: list[str], energy_level: float | None) -> str:
    """Returns the preferred cold-start arm based on energy."""
    recovery_id = next((a for a in arm_ids if "recovery" in a), arm_ids[0])
    standard_id = next((a for a in arm_ids if "standard" in a), arm_ids[0])
    if energy_level is not None and energy_level < 3:
        return recovery_id
    return standard_id


def all_scores_tied(ucb_scores: dict[str, float], rel_tolerance: float = 0.01) -> bool:
    """True when the score spread is less than rel_tolerance × the scale of the scores."""
    values = list(ucb_scores.values())
    if not values:
        return True
    spread = max(values) - min(values)
    scale = max(abs(max(values)), 1e-6)
    return spread / scale <= rel_tolerance
