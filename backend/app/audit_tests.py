"""Classic journal entry tests. Each takes the entries frame and returns {entry_id: reason}."""
import math

import numpy as np
import pandas as pd
from scipy.stats import chi2

from .config import Settings

Hits = dict[str, str]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _collect(e: pd.DataFrame, mask: pd.Series, reason) -> Hits:
    return {str(r.Index): reason(r) for r in e[mask].itertuples()}


def check_duplicates(e: pd.DataFrame, s: Settings | None = None) -> Hits:
    """Same amount, debit account and posting date on more than one entry."""
    size = e.groupby(["amount", "debit_account", "date"])["amount"].transform("size")
    return _collect(e, size > 1, lambda r: f"Same amount ({r.amount:,.2f}), account {r.debit_account} "
                                           f"and date as another entry")


def check_weekend(e: pd.DataFrame, s: Settings | None = None) -> Hits:
    return _collect(e, e["date"].dt.day_of_week >= 5, lambda r: f"Posted on a {DAYS[r.date.day_of_week]}")


def check_after_hours(e: pd.DataFrame, s: Settings) -> Hits:
    m = (e["hour"] < s.work_start) | (e["hour"] >= s.work_end)
    return _collect(e, m, lambda r: f"Posted at {r.posting_time}, outside {s.work_start:02d}:00-{s.work_end:02d}:00")


def check_round_numbers(e: pd.DataFrame, s: Settings | None = None) -> Hits:
    m = (e["amount"] >= 1000) & (np.isclose(e["amount"] % 1000, 0))
    return _collect(e, m, lambda r: f"Round amount of {r.amount:,.0f}")


def check_threshold(e: pd.DataFrame, s: Settings) -> Hits:
    low = s.approval_threshold * (1 - s.threshold_band)
    m = (e["amount"] >= low) & (e["amount"] < s.approval_threshold)
    return _collect(e, m, lambda r: f"{r.amount:,.2f} is just below the {s.approval_threshold:,.0f} approval threshold")


def check_self_approved(e: pd.DataFrame, s: Settings | None = None) -> Hits:
    m = (e["posted_by"] != "") & (e["posted_by"] == e["approved_by"])
    return _collect(e, m, lambda r: f"Posted and approved by the same person ({r.posted_by})")


def check_unusual_pairing(e: pd.DataFrame, s: Settings) -> Hits:
    """Debit/credit account pairs that are rare in this ledger."""
    pair = e["debit_account"] + ">" + e["credit_account"]
    share = pair.map(pair.value_counts(normalize=True))
    return _collect(e, share < s.rare_pair_share,
                    lambda r: f"Rare pairing: debit {r.debit_account} / credit {r.credit_account}")


def _first_digit(amount: pd.Series) -> pd.Series:
    """Leading non-zero digit as a string ('' when amount < 1)."""
    txt = amount.where(amount >= 1, 0).map(lambda x: f"{x:.2f}")
    return txt.str[0].where(amount >= 1, "")


def benford_stats(e: pd.DataFrame) -> dict:
    """Chi-square test of first-digit frequencies against Benford's Law."""
    first = _first_digit(e["amount"])
    first = first[first != ""].astype(int)
    n = len(first)
    counts = first.value_counts().reindex(range(1, 10), fill_value=0)
    expected = np.array([math.log10(1 + 1 / d) for d in range(1, 10)])
    chi = float(((counts.values - expected * n) ** 2 / (expected * n)).sum()) if n else 0.0
    p = float(chi2.sf(chi, 8)) if n else 1.0
    digits = [{"digit": d, "expected": float(expected[d - 1]), "actual": float(counts[d] / n) if n else 0.0}
              for d in range(1, 10)]
    return {"digits": digits, "chi2": chi, "p_value": p, "n": int(n)}


def check_benford(e: pd.DataFrame, s: Settings | None = None) -> tuple[Hits, dict]:
    """If the distribution deviates, flag entries whose leading digit is over-represented (>2 pts)."""
    stats = benford_stats(e)
    if stats["p_value"] >= 0.05:
        return {}, stats
    over = {str(d["digit"]) for d in stats["digits"] if d["actual"] - d["expected"] > 0.02}
    m = _first_digit(e["amount"]).isin(over)
    return _collect(e, m, lambda r: "Leading digit is over-represented versus Benford's Law"), stats
