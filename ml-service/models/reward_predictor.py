import json
from typing import Any
import numpy as np

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except ImportError:
    XGB_AVAILABLE = False

from models.feature_builder import build_xgb_features


class RewardPredictor:
    """XGBoost-based reward predictor. Falls back to mean estimate if model unavailable."""

    def __init__(self) -> None:
        self.model: Any = None
        self._mean_reward: float = 0.6

    def load_from_json(self, model_json: str) -> None:
        if not XGB_AVAILABLE:
            return
        self.model = xgb.XGBRegressor()
        self.model.load_model(bytearray(model_json.encode()))

    def to_json(self) -> str | None:
        if self.model is None or not XGB_AVAILABLE:
            return None
        return self.model.save_model(to_buffer=True).decode()  # type: ignore[attr-defined]

    def predict(self, ctx: dict[str, Any], focus_minutes: int, break_minutes: int, mode: str) -> float:
        if self.model is None or not XGB_AVAILABLE:
            return self._mean_reward

        x = build_xgb_features(ctx, focus_minutes, break_minutes, mode)
        pred = float(self.model.predict(x.reshape(1, -1))[0])
        return max(0.0, min(1.0, pred))

    def predict_all_arms(self, ctx: dict[str, Any], arms: list[dict]) -> dict[str, float]:
        return {
            arm["id"]: self.predict(ctx, arm["focus_minutes"], arm["break_minutes"], arm["mode"])
            for arm in arms
        }
