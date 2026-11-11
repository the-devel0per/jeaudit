"""Precision/recall per test against injected ground truth.

Usage: python data/evaluate.py [--rows 60000]   -> writes data/eval_results.json and backend/app/assets/
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "data"))

from app.config import TEST_LABELS, Settings
from app.ledger import build_entries
from app.scoring import RULE_TESTS, run_pipeline
from generate_gl import generate

LABEL_FOR = {"duplicate": "duplicate", "weekend": "weekend", "after_hours": "after_hours", "round_number": "round",
             "threshold": "threshold", "self_approved": "self_approved", "unusual_pairing": "unusual_pairing"}


def metrics(pred: set[str], truth: set[str]) -> dict:
    tp, fp, fn = len(pred & truth), len(pred - truth), len(truth - pred)
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(p, 3), "recall": round(r, 3),
            "f1": round(2 * p * r / (p + r), 3) if p + r else 0.0, "injected": len(truth), "flagged": len(pred)}


def evaluate(rows: int = 60000, seed: int = 7) -> dict:
    gl, truth = generate(rows, seed)
    # the generator already produces the right column names; build entries directly
    e = build_entries(gl)
    res = run_pipeline(e, Settings())
    all_truth = set(truth)
    out = []
    for k in RULE_TESTS:
        t = {i for i, labels in truth.items() if LABEL_FOR[k] in labels}
        out.append({"test": k, "label": TEST_LABELS[k], **metrics(set(res.hits[k]), t)})
    out.append({"test": "ml", "label": TEST_LABELS["ml"], **metrics(res.ml_flagged, all_truth)})
    out.append({"test": "combined", "label": "Combined risk score >= 15", **metrics({f["entry_id"] for f in res.flags}, all_truth)})
    return {"rows": len(gl), "entries": len(e), "injected_entries": len(all_truth), "tests": out,
            "overlap": res.summary["overlap"], "benford": res.summary["benford"],
            "note": "Benford's Law is a ledger-level test with no per-entry ground truth, so it is not scored here."}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=60000)
    a = ap.parse_args()
    result = evaluate(a.rows)
    text = json.dumps(result, indent=2)
    (ROOT / "data" / "eval_results.json").write_text(text)
    (ROOT / "backend" / "app" / "assets" / "eval_results.json").write_text(text)
    for t in result["tests"]:
        print(f"{t['label']:<28} precision {t['precision']:.2f}  recall {t['recall']:.2f}")
    print("overlap:", result["overlap"])
