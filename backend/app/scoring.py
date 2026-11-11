"""Rule + ML scoring pipeline: runs every test, adds Isolation Forest, builds 0-100 risk scores."""
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from . import audit_tests as t
from .config import MIN_FLAG_SCORE, TEST_LABELS, Settings

RULE_TESTS = ["duplicate", "weekend", "after_hours", "round_number", "threshold", "self_approved", "unusual_pairing"]


@dataclass
class Result:
    hits: dict[str, t.Hits] = field(default_factory=dict)  # test -> {entry_id: reason}
    ml_flagged: set[str] = field(default_factory=set)
    ml_norm: pd.Series | None = None
    flags: list[dict] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


def severity(score: float) -> str:
    return "critical" if score >= 80 else "high" if score >= 60 else "medium" if score >= 40 else "low"


def ml_scores(e: pd.DataFrame, s: Settings) -> tuple[pd.Series, set[str]]:
    """Isolation Forest on simple, explainable features. Returns 0-1 anomaly score + flagged ids."""
    pair = e["debit_account"] + ">" + e["credit_account"]
    X = pd.DataFrame({
        "log_amount": np.log1p(e["amount"]), "hour": e["hour"], "dow": e["date"].dt.day_of_week,
        "round": np.isclose(e["amount"] % 1000, 0).astype(int),
        "near_threshold": ((e["amount"] >= s.approval_threshold * (1 - s.threshold_band))
                           & (e["amount"] < s.approval_threshold)).astype(int),
        "self_approved": (e["posted_by"] == e["approved_by"]).astype(int),
        "pair_freq": np.log(pair.map(pair.value_counts(normalize=True))),
        "debit": e["debit_account"].astype("category").cat.codes,
        "credit": e["credit_account"].astype("category").cat.codes,
    }, index=e.index)
    iso = IsolationForest(n_estimators=150, contamination=0.02, random_state=42, n_jobs=1).fit(X)
    raw = -iso.score_samples(X)
    norm = pd.Series((raw - raw.min()) / (np.ptp(raw) or 1), index=e.index)
    flagged = set(e.index[iso.predict(X) == -1].astype(str))
    return norm, flagged


def run_pipeline(e: pd.DataFrame, s: Settings) -> Result:
    res = Result()
    res.hits = {
        "duplicate": t.check_duplicates(e, s), "weekend": t.check_weekend(e, s),
        "after_hours": t.check_after_hours(e, s), "round_number": t.check_round_numbers(e, s),
        "threshold": t.check_threshold(e, s), "self_approved": t.check_self_approved(e, s),
        "unusual_pairing": t.check_unusual_pairing(e, s),
    }
    res.hits["benford"], benford = t.check_benford(e, s)
    res.ml_norm, res.ml_flagged = ml_scores(e, s)

    ids = set(res.ml_flagged).union(*[set(h) for h in res.hits.values()])
    rule_ids = set().union(*[set(res.hits[k]) for k in RULE_TESTS])
    for eid in ids:
        hits = [{"test": k, "label": TEST_LABELS[k], "weight": s.weights.get(k, 0), "reason": h[eid]}
                for k, h in res.hits.items() if eid in h]
        if eid in res.ml_flagged:
            w = round(s.weights.get("ml", 0) * float(res.ml_norm[eid]), 1)
            hits.append({"test": "ml", "label": TEST_LABELS["ml"], "weight": w,
                         "reason": f"Isolation Forest anomaly score {res.ml_norm[eid]:.2f}"})
        score = min(100.0, round(sum(h["weight"] for h in hits), 1))
        if score >= MIN_FLAG_SCORE:
            row = e.loc[eid]
            res.flags.append({
                "entry_id": eid, "score": score, "severity": severity(score), "hits": hits,
                "ml_score": round(float(res.ml_norm[eid]), 3), "ml_flagged": eid in res.ml_flagged,
                "entry": {"posting_date": row["date"].strftime("%Y-%m-%d"), "posting_time": str(row["posting_time"]),
                          "amount": float(row["amount"]), "debit_account": row["debit_account"],
                          "credit_account": row["credit_account"], "description": row["description"],
                          "posted_by": row["posted_by"], "approved_by": row["approved_by"]}})
    res.flags.sort(key=lambda f: -f["score"])

    both = len(rule_ids & res.ml_flagged)
    union = len(rule_ids | res.ml_flagged) or 1
    kept = [f["score"] for f in res.flags]
    res.summary = {
        "entries_tested": len(e), "flagged": len(res.flags),
        "high_risk": sum(1 for f in res.flags if f["severity"] in ("critical", "high")),
        "value_at_risk": float(sum(f["entry"]["amount"] for f in res.flags)),
        "distribution": [{"bucket": f"{b}-{b + 9}" if b < 90 else "90-100",
                          "count": sum(1 for x in kept if b <= x < b + 10 or (b == 90 and x == 100))}
                         for b in range(0, 100, 10)],
        "tests": sorted(({"test": k, "label": TEST_LABELS[k],
                          "count": sum(1 for f in res.flags if any(h["test"] == k for h in f["hits"]))}
                         for k in [*RULE_TESTS, "benford", "ml"]), key=lambda d: -d["count"]),
        "benford": benford,
        "overlap": {"both": both, "rule_only": len(rule_ids - res.ml_flagged), "ml_only": len(res.ml_flagged - rule_ids),
                    "jaccard": round(both / union, 3)},
    }
    return res
