import logging
import numpy as np
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

FEATURE_DIM = 14
FEATURE_SCHEMA_VERSION = "v1"


class DisjointLinUCB:
    """Disjoint Linear UCB bandit. Each arm maintains its own (A, b) parameters."""

    def __init__(self, alpha: float = 1.0, d: int = FEATURE_DIM, arm_ids: list[str] | None = None):
        self.alpha = alpha
        self.d = d
        self.arm_ids: list[str] = arm_ids or []
        self.A: Dict[str, np.ndarray] = {arm: np.eye(d) for arm in self.arm_ids}
        self.b: Dict[str, np.ndarray] = {arm: np.zeros(d) for arm in self.arm_ids}
        self._update_count = 0

    def _invert_A(self, arm_id: str) -> np.ndarray:
        """Invert A[arm] with a ridge regularization fallback for numerical stability."""
        try:
            return np.linalg.inv(self.A[arm_id])
        except np.linalg.LinAlgError:
            logger.warning("Singular matrix for arm %s — applying ridge regularization", arm_id)
            return np.linalg.inv(self.A[arm_id] + np.eye(self.d) * 1e-6)

    def _ensure_arm(self, arm_id: str) -> None:
        if arm_id not in self.A:
            self.A[arm_id] = np.eye(self.d)
            self.b[arm_id] = np.zeros(self.d)
            if arm_id not in self.arm_ids:
                self.arm_ids.append(arm_id)

    def score(self, x: np.ndarray) -> Dict[str, float]:
        scores: Dict[str, float] = {}
        for arm in self.arm_ids:
            A_inv = self._invert_A(arm)
            theta = A_inv @ self.b[arm]
            ucb = float(theta @ x + self.alpha * np.sqrt(x @ A_inv @ x))
            scores[arm] = ucb
        return scores

    def select(
        self,
        x: np.ndarray,
        eligible_arms: list[str] | None = None,
        epsilon: float = 0.0,
    ) -> Tuple[str, Dict[str, float], float, bool]:
        """
        Returns (arm_id, ucb_scores, propensity, exploration_flag).
        epsilon controls ε-greedy exploration rate.
        """
        scores = self.score(x)
        arms = eligible_arms if eligible_arms else self.arm_ids
        n = len(arms)

        explore = n > 1 and np.random.random() < epsilon

        if explore:
            arm_id = str(np.random.choice(arms))
            propensity = epsilon / n
            exploration_flag = True
        else:
            arm_id = max(arms, key=lambda a: scores.get(a, -float("inf")))
            propensity = (1.0 - epsilon) + epsilon / n if n > 0 else 1.0
            exploration_flag = False

        return arm_id, scores, propensity, exploration_flag

    @staticmethod
    def select_from_scores(
        scores: Dict[str, float],
        eligible_arms: list[str] | None = None,
        epsilon: float = 0.0,
    ) -> Tuple[str, float, bool]:
        """Select an arm from pre-computed UCB scores (no bandit state access needed)."""
        arms = eligible_arms if eligible_arms else list(scores.keys())
        n = len(arms)
        explore = n > 1 and np.random.random() < epsilon
        if explore:
            arm_id = str(np.random.choice(arms))
            propensity = epsilon / n
            exploration_flag = True
        else:
            arm_id = max(arms, key=lambda a: scores.get(a, -float("inf")))
            propensity = (1.0 - epsilon) + epsilon / n if n > 0 else 1.0
            exploration_flag = False
        return arm_id, propensity, exploration_flag

    def update(self, arm_id: str, x: np.ndarray, reward: float) -> None:
        self._ensure_arm(arm_id)
        self.A[arm_id] += np.outer(x, x)
        self.b[arm_id] += reward * x
        self._update_count += 1

    @property
    def update_count(self) -> int:
        return self._update_count

    def to_dict(self) -> dict:
        return {
            "alpha": self.alpha,
            "d": self.d,
            "arm_ids": self.arm_ids,
            "A": {arm: self.A[arm].tolist() for arm in self.arm_ids},
            "b": {arm: self.b[arm].tolist() for arm in self.arm_ids},
            "update_count": self._update_count,
            "feature_schema_version": FEATURE_SCHEMA_VERSION,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "DisjointLinUCB":
        obj = cls(alpha=data["alpha"], d=data["d"], arm_ids=data["arm_ids"])
        obj.A = {arm: np.array(data["A"][arm]) for arm in data["arm_ids"]}
        obj.b = {arm: np.array(data["b"][arm]) for arm in data["arm_ids"]}
        obj._update_count = data.get("update_count", 0)
        return obj


def make_cold_start_bandit(arm_ids: list[str], d: int = FEATURE_DIM, alpha: float = 2.0) -> DisjointLinUCB:
    """Initialises a bandit with inflated uncertainty for cold-start users."""
    bandit = DisjointLinUCB(alpha=alpha, d=d, arm_ids=arm_ids)
    for arm in arm_ids:
        bandit.A[arm] = 2.0 * np.eye(d)
    return bandit
