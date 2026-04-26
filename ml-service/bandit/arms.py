from typing import TypedDict


class Arm(TypedDict):
    id: str
    focus_minutes: int
    break_minutes: int
    mode: str


ARMS: list[Arm] = [
    {"id": "recovery", "focus_minutes": 25, "break_minutes": 5,  "mode": "recovery"},
    {"id": "standard", "focus_minutes": 35, "break_minutes": 5,  "mode": "standard"},
    {"id": "deep_45",  "focus_minutes": 45, "break_minutes": 10, "mode": "deep"},
    {"id": "deep_55",  "focus_minutes": 55, "break_minutes": 10, "mode": "deep"},
]

ARM_IDS: list[str] = [a["id"] for a in ARMS]
ARM_MAP: dict[str, Arm] = {a["id"]: a for a in ARMS}
