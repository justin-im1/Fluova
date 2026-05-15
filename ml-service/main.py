import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import numpy as np

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from bandit.arms import ARM_IDS, ARM_MAP
from bandit.context import context_to_vector
from bandit.exploration import (
    apply_safe_exploration,
    cold_start_alpha,
    all_scores_tied,
    select_cold_start_default,
)
from bandit.linucb import DisjointLinUCB
from models.reward_predictor import RewardPredictor
from storage.model_store import load_bandit, save_bandit_dict, should_save

logger = logging.getLogger("fluova.ml")
logging.basicConfig(level=logging.INFO)

LINUCB_ALPHA        = float(os.getenv("LINUCB_ALPHA", "1.0"))
LINUCB_COLD_ALPHA   = float(os.getenv("LINUCB_COLD_START_ALPHA", "2.0"))
COLD_START_THRESHOLD = int(os.getenv("LINUCB_COLD_START_THRESHOLD", "10"))
ADMIN_API_KEY       = os.getenv("ADMIN_API_KEY", "")
EXPOSE_THETA        = os.getenv("EXPOSE_THETA", "false").lower() == "true"


# ── App state ──────────────────────────────────────────────────────────────────

class AppState:
    bandit: DisjointLinUCB
    reward_model: RewardPredictor
    lock: asyncio.Lock
    model_loaded: bool = False


state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.lock = asyncio.Lock()
    state.reward_model = RewardPredictor()
    try:
        state.bandit = load_bandit(default_alpha=LINUCB_ALPHA)
        state.model_loaded = True
        logger.info("ML service ready (update_count=%d)", state.bandit.update_count)
    except Exception:
        logger.exception("Failed to load bandit — using fresh cold-start model")
        from bandit.linucb import make_cold_start_bandit
        state.bandit = make_cold_start_bandit(ARM_IDS, alpha=LINUCB_COLD_ALPHA)
        state.model_loaded = False
    yield


app = FastAPI(title="Fluova ML Service", lifespan=lifespan)


# ── Auth helper ────────────────────────────────────────────────────────────────

def _require_admin(request: Request) -> None:
    key = request.headers.get("x-admin-api-key") or request.headers.get("authorization", "").removeprefix("Bearer ")
    if ADMIN_API_KEY and key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Schemas ────────────────────────────────────────────────────────────────────

class RecommendRequest(BaseModel):
    user_id: str
    context_snapshot: dict[str, Any]
    session_count: int = 0


class UpdateRequest(BaseModel):
    arm_id: str
    context_snapshot: dict[str, Any]
    reward: float


class EvaluateRequest(BaseModel):
    start_date: str | None = None
    end_date: str | None = None


class TrainRequest(BaseModel):
    start_date: str | None = None
    end_date: str | None = None
    reward_version: str = "reward_v1"
    min_samples: int = 50


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": state.model_loaded}


@app.post("/recommend")
async def recommend(req: RecommendRequest, request: Request):
    _require_admin(request)
    ctx = req.context_snapshot
    session_count = req.session_count
    is_cold = session_count < COLD_START_THRESHOLD

    x = context_to_vector(ctx)

    # Snapshot matrices under lock so UCB computation runs outside the lock.
    # This prevents /update from being blocked during matrix inversions.
    async with state.lock:
        effective_alpha = cold_start_alpha(LINUCB_ALPHA, session_count, COLD_START_THRESHOLD)
        state.bandit.alpha = effective_alpha if is_cold else LINUCB_ALPHA
        arms_snap = {
            a: (state.bandit.A[a].copy(), state.bandit.b[a].copy())
            for a in state.bandit.arm_ids
        }
        alpha_snap = state.bandit.alpha

    # Compute UCB scores from snapshot — no lock held during matrix inversions
    ucb_scores: dict[str, float] = {}
    for arm, (A, b) in arms_snap.items():
        try:
            A_inv = np.linalg.inv(A)
        except np.linalg.LinAlgError:
            A_inv = np.linalg.inv(A + np.eye(A.shape[0]) * 1e-6)
        theta = A_inv @ b
        ucb_scores[arm] = float(theta @ x + alpha_snap * np.sqrt(x @ A_inv @ x))

    eligible_arms, epsilon = apply_safe_exploration(
        ucb_scores,
        user_session_count=session_count,
    )

    # Cold-start default when all scores are tied (nearly uninformed prior)
    if is_cold and all_scores_tied(ucb_scores):
        energy = ctx.get("energy_level")
        arm_id = select_cold_start_default(eligible_arms or ARM_IDS, energy)
        propensity = 1.0 / len(eligible_arms) if eligible_arms else 1.0
        exploration_flag = False
    else:
        arm_id, propensity, exploration_flag = DisjointLinUCB.select_from_scores(
            ucb_scores, eligible_arms=eligible_arms, epsilon=epsilon
        )

    arm = ARM_MAP[arm_id]

    # Confidence level heuristic from session count
    if session_count < 4:
        confidence_level = "learning"
    elif session_count < 18:
        confidence_level = "calibrating"
    else:
        confidence_level = "confident"

    return {
        "arm_id": arm_id,
        "focus_minutes": arm["focus_minutes"],
        "break_minutes": arm["break_minutes"],
        "mode": arm["mode"],
        "ucb_scores": ucb_scores,
        "propensity": propensity,
        "exploration_flag": exploration_flag,
        "confidence_level": confidence_level,
    }


@app.post("/update")
async def update(req: UpdateRequest, request: Request):
    _require_admin(request)
    if req.arm_id not in ARM_IDS:
        raise HTTPException(status_code=400, detail=f"Unknown arm_id: {req.arm_id}")
    if not (0.0 <= req.reward <= 1.0):
        raise HTTPException(status_code=400, detail="reward must be in [0, 1]")

    x = context_to_vector(req.context_snapshot)

    async with state.lock:
        state.bandit.update(req.arm_id, x, req.reward)
        do_save = should_save(state.bandit)
        snapshot = state.bandit.to_dict() if do_save else None

    if snapshot:
        asyncio.get_running_loop().run_in_executor(None, save_bandit_dict, snapshot)

    return {"success": True, "update_count": state.bandit.update_count}


@app.post("/evaluate")
async def evaluate(req: EvaluateRequest, request: Request):
    _require_admin(request)
    from evaluation.pipeline import run_policy_evaluation
    result = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: run_policy_evaluation(
            start_date=req.start_date,
            end_date=req.end_date,
            reward_model=state.reward_model if state.reward_model.model else None,
        ),
    )
    return result


@app.post("/train")
async def train(req: TrainRequest, request: Request):
    _require_admin(request)
    from models.trainer import train_reward_predictor
    result = await asyncio.get_running_loop().run_in_executor(
        None,
        lambda: train_reward_predictor(
            start_date=req.start_date,
            end_date=req.end_date,
            reward_version=req.reward_version,
            min_samples=req.min_samples,
        ),
    )
    if result is None:
        return JSONResponse(status_code=422, content={"error": "training_skipped"})
    return {"model_version_id": result.model_version_id, "metrics": result.metrics}


@app.get("/diagnostics")
async def diagnostics(request: Request):
    _require_admin(request)
    async with state.lock:
        bandit_dict = state.bandit.to_dict()

    d = bandit_dict["d"]
    theta_by_arm = {
        arm: (np.linalg.inv(np.array(bandit_dict["A"][arm])) @ np.array(bandit_dict["b"][arm])).tolist()
        for arm in bandit_dict["arm_ids"]
    }

    # A[i] = I + sum of outer products; trace - d gives total squared-feature mass, not raw counts.
    # Use update_count (tracked explicitly) as the authoritative total, and approximate
    # per-arm share via the trace of (A - I).
    total_updates = bandit_dict["update_count"]
    trace_by_arm = {
        arm: float(np.trace(np.array(bandit_dict["A"][arm])) - d)
        for arm in bandit_dict["arm_ids"]
    }
    total_trace = sum(trace_by_arm.values()) or 1.0
    action_counts = {
        arm: round(total_updates * trace_by_arm[arm] / total_trace)
        for arm in bandit_dict["arm_ids"]
    }

    response: dict = {
        "action_counts": action_counts,
        "alpha": bandit_dict["alpha"],
        "update_count": total_updates,
        "feature_schema_version": bandit_dict.get("feature_schema_version", "v1"),
        "model_loaded": state.model_loaded,
    }
    if EXPOSE_THETA:
        response["theta_by_arm"] = {arm: [round(v, 4) for v in theta_by_arm[arm]] for arm in bandit_dict["arm_ids"]}
    return response
