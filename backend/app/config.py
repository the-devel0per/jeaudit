"""Settings and environment configuration."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from pydantic import BaseModel, Field

MODE = os.getenv("JE_GUARD_MODE", "local")  # "local" (files) or "aws" (S3 + DynamoDB)
ASSETS = Path(__file__).parent / "assets"
MIN_FLAG_SCORE = 15  # entries scoring below this are not shown as flags

DEFAULT_WEIGHTS: dict[str, float] = {
    "self_approved": 30, "duplicate": 25, "threshold": 25, "unusual_pairing": 20,
    "round_number": 15, "weekend": 15, "after_hours": 15, "benford": 5, "ml": 20,
}

TEST_LABELS: dict[str, str] = {
    "self_approved": "Self-approved", "duplicate": "Duplicate entry", "threshold": "Just below threshold",
    "unusual_pairing": "Unusual account pairing", "round_number": "Round amount", "weekend": "Weekend posting",
    "after_hours": "After-hours posting", "benford": "Benford's Law digit", "ml": "Statistical outlier (ML)",
}


class Settings(BaseModel):
    """Auditor-configurable parameters (sent from the Settings screen)."""
    approval_threshold: float = Field(10000, gt=0)
    threshold_band: float = Field(0.05, gt=0, lt=0.5)  # "just below" = within 5% under the threshold
    work_start: int = Field(8, ge=0, le=23)
    work_end: int = Field(18, ge=1, le=24)
    rare_pair_share: float = Field(0.005, gt=0, lt=0.2)
    weights: dict[str, float] = Field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
