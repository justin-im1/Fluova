import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from evaluation.ips import compute_ips, compute_snips, compute_doubly_robust
from storage.supabase_client import get_supabase

logger = logging.getLogger(__name__)


def run_policy_evaluation(
    start_date: str | None = None,
    end_date: str | None = None,
    reward_model: Any = None,
    candidate_policy_version: str = "linucb_v1",
) -> dict[str, Any]:
    """
    Loads recommendation_events + sessions, computes IPS/SNIPS/DR, writes to policy_evaluations.
    Returns the policy_evaluations row dict.
    """
    supabase = get_supabase()
    now = datetime.now(timezone.utc)

    if start_date == "auto" or start_date is None:
        start_date = (now - timedelta(days=30)).isoformat()
    if end_date == "auto" or end_date is None:
        end_date = now.isoformat()

    # Load recommendation events with context and outcome
    rec_result = (
        supabase.table("recommendation_events")
        .select("id, user_id, recommended_focus_minutes, propensity, exploration_flag, context_snapshot, policy_version, policy_type")
        .gte("shown_at", start_date)
        .lte("shown_at", end_date)
        .eq("policy_type", "linucb")
        .not_is("propensity", "null")
        .execute()
    )
    rec_events = rec_result.data or []

    if not rec_events:
        logger.warning("No recommendation events found for evaluation window")
        return {"error": "no_events"}

    # Load sessions linked to these recommendation events
    rec_ids = [r["id"] for r in rec_events]
    sess_result = (
        supabase.table("sessions")
        .select("recommendation_event_id, reward_value, focus_duration_sec, session_type")
        .in_("recommendation_event_id", rec_ids)
        .not_is("reward_value", "null")
        .execute()
    )
    reward_map: dict[str, float] = {
        s["recommendation_event_id"]: float(s["reward_value"])
        for s in (sess_result.data or [])
    }

    # Build event dicts for estimators
    events: list[dict] = []
    for r in rec_events:
        reward = reward_map.get(r["id"])
        if reward is None:
            continue
        events.append({
            "reward": reward,
            "propensity": float(r.get("propensity") or 1.0),
            "chosen": True,  # logged events are always chosen actions
            "arm_id": _focus_min_to_arm_id(r.get("recommended_focus_minutes")),
            "context_snapshot": r.get("context_snapshot") or {},
        })

    if not events:
        logger.warning("No matched events with rewards")
        return {"error": "no_matched_events"}

    ips   = compute_ips(events)
    snips = compute_snips(events)
    dr    = compute_doubly_robust(events, reward_model) if reward_model else snips

    # Confidence interval: bootstrap std * 1.96
    import numpy as np
    rewards = [e["reward"] for e in events]
    std = float(np.std(rewards))
    n = len(events)
    ci_half = 1.96 * std / (n ** 0.5) if n > 0 else 0.0

    # Write to policy_evaluations
    logged_version = rec_events[0].get("policy_version", "unknown") if rec_events else "unknown"
    pe_result = (
        supabase.table("policy_evaluations")
        .insert({
            "candidate_policy_version": candidate_policy_version,
            "logged_policy_version": logged_version,
            "evaluation_window": {"start": start_date, "end": end_date},
            "method": "dr" if reward_model else "snips",
            "estimated_policy_value": dr if reward_model else snips,
            "confidence_interval": {"low": snips - ci_half, "high": snips + ci_half},
            "notes": f"ips={ips:.4f} snips={snips:.4f} dr={dr:.4f} n={n}",
        })
        .execute()
    )
    row = pe_result.data[0] if pe_result.data else {}

    return {
        "policy_eval_id": row.get("id"),
        "ips": ips,
        "snips": snips,
        "dr": dr,
        "n_events": n,
    }


def _focus_min_to_arm_id(focus_minutes: int | None) -> str:
    mapping = {25: "recovery", 35: "standard", 45: "deep_45", 55: "deep_55"}
    return mapping.get(focus_minutes or 0, "standard")
