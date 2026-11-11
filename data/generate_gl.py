"""Synthetic general ledger generator with INJECTED anomalies and a ground-truth file.

Usage: python data/generate_gl.py --rows 60000 --out data/synthetic_gl.csv
Every entry has two lines (debit + credit), so rows = 2 x entries. SYNTHETIC DATA ONLY.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

USERS = ["a.sharma", "b.patel", "c.nair", "d.singh", "e.rao", "f.das", "g.iyer", "h.khan"]
APPROVERS = ["m.verma", "n.reddy", "o.joshi"]
# (debit, credit, description, weight) - the normal business flows
NORMAL = [("1100", "4000", "Customer invoice", 30), ("1000", "1100", "Customer receipt", 20),
          ("5000", "2000", "Supplier invoice - COGS", 15), ("2000", "1000", "Supplier payment", 15),
          ("6000", "1000", "Payroll run", 5), ("6100", "2000", "Rent accrual", 3), ("6200", "2000", "Utilities", 3),
          ("6300", "1000", "Travel reimbursement", 3), ("6400", "2000", "Marketing spend", 3),
          ("1200", "2000", "Inventory purchase", 3)]
ODD = [("6000", "3000", "Salary booked to equity"), ("3000", "6200", "Equity to utilities"),
       ("4000", "1000", "Revenue debited to cash"), ("1500", "6300", "Fixed asset vs travel"),
       ("3000", "1100", "Equity vs receivables"), ("6100", "3000", "Rent vs equity")]
RATES = {"round": .008, "threshold": .008, "weekend": .008, "after_hours": .006,
         "self_approved": .005, "unusual_pairing": .004, "duplicate": .006}


def generate(rows: int = 60000, seed: int = 7) -> tuple[pd.DataFrame, dict[str, list[str]]]:
    rng = np.random.default_rng(seed)
    n = rows // 2
    w = np.array([p[3] for p in NORMAL], float)
    idx = rng.choice(len(NORMAL), n, p=w / w.sum())
    days = pd.bdate_range("2025-01-01", "2025-12-31")
    e = pd.DataFrame({
        "date": days[rng.integers(0, len(days), n)], "hour": rng.integers(8, 18, n),
        "minute": rng.integers(0, 60, n), "amount": np.round(np.clip(rng.lognormal(7.5, 1.4, n), 50, 9e6), 2),
        "debit": [NORMAL[i][0] for i in idx], "credit": [NORMAL[i][1] for i in idx],
        "desc": [NORMAL[i][2] for i in idx], "posted_by": rng.choice(USERS, n), "approved_by": rng.choice(APPROVERS, n)})
    nat = rng.random(n) < 0.003  # a few naturally round invoices -> realistic false positives
    e.loc[nat, "amount"] = np.round(e.loc[nat, "amount"], -3).clip(lower=1000)
    e["labels"] = [[] for _ in range(n)]

    perm = list(rng.permutation(n))
    def take(frac): k = int(n * frac); out, perm[:] = perm[:k], perm[k:]; return out

    for i in take(RATES["round"]):
        e.at[i, "amount"] = float(rng.choice([1000, 2000, 5000, 10000, 25000, 50000, 100000])); e.at[i, "labels"] = ["round"]
    for i in take(RATES["threshold"]):
        e.at[i, "amount"] = round(float(rng.uniform(9500, 9999.99)), 2); e.at[i, "labels"] = ["threshold"]
    for i in take(RATES["weekend"]):
        e.at[i, "date"] = e.at[i, "date"] + pd.Timedelta(days=5 - e.at[i, "date"].dayofweek + int(rng.integers(0, 2)))
        e.at[i, "labels"] = ["weekend"]
    for i in take(RATES["after_hours"]):
        e.at[i, "hour"] = int(rng.choice([21, 22, 23, 0, 1, 2, 3])); e.at[i, "labels"] = ["after_hours"]
    for i in take(RATES["self_approved"]):
        e.at[i, "approved_by"] = e.at[i, "posted_by"]; e.at[i, "labels"] = ["self_approved"]
    for i in take(RATES["unusual_pairing"]):
        d, c, t = ODD[int(rng.integers(0, len(ODD)))]
        e.at[i, "debit"], e.at[i, "credit"], e.at[i, "desc"] = d, c, t; e.at[i, "labels"] = ["unusual_pairing"]
    dups = take(RATES["duplicate"])
    copy = e.loc[dups].copy()
    copy["posted_by"] = rng.choice(USERS, len(copy)); copy["hour"] = rng.integers(8, 18, len(copy))
    for i in dups:
        e.at[i, "labels"] = ["duplicate"]  # the original and the copy are both ground-truth positives
    copy["labels"] = [["duplicate"] for _ in range(len(copy))]
    e = pd.concat([e, copy], ignore_index=True).sort_values(["date", "hour", "minute"], kind="stable").reset_index(drop=True)
    e["entry_id"] = [f"JE{i + 1:06d}" for i in range(len(e))]
    truth = {r.entry_id: r.labels for r in e.itertuples() if r.labels}

    lines = []
    for side in ("debit", "credit"):
        d = pd.DataFrame({
            "entry_id": e["entry_id"], "posting_date": e["date"].dt.strftime("%Y-%m-%d"),
            "posting_time": e.apply(lambda r: f"{r.hour:02d}:{r.minute:02d}:00", axis=1),
            "account": e[side], "debit": e["amount"] if side == "debit" else 0.0,
            "credit": e["amount"] if side == "credit" else 0.0, "description": e["desc"] + " #" + e["entry_id"].str[2:],
            "posted_by": e["posted_by"], "approved_by": e["approved_by"], "amount": e["amount"]})
        lines.append(d)
    gl = pd.concat(lines).sort_values(["entry_id"], kind="stable").reset_index(drop=True)
    return gl, truth


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=60000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="data/synthetic_gl.csv")
    a = ap.parse_args()
    gl, truth = generate(a.rows, a.seed)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    gl.to_csv(out, index=False)
    out.with_suffix(".truth.json").write_text(json.dumps(truth))
    print(f"Wrote {len(gl):,} rows to {out} with {len(truth):,} injected-anomaly entries (synthetic data only).")
