import pandas as pd
from app import audit_tests as t
from app.config import Settings

S = Settings()


def frame(**cols) -> pd.DataFrame:
    n = len(next(iter(cols.values())))
    base = {"date": pd.to_datetime(["2025-03-03"] * n), "hour": [10] * n, "posting_time": ["10:00:00"] * n,
            "amount": [123.45] * n, "debit_account": ["1100"] * n, "credit_account": ["4000"] * n,
            "posted_by": ["a"] * n, "approved_by": ["b"] * n, "description": ["x"] * n}
    base.update(cols)
    return pd.DataFrame(base, index=[f"E{i}" for i in range(n)])


def test_duplicates():
    assert set(t.check_duplicates(frame(amount=[500.0, 500.0, 600.0]))) == {"E0", "E1"}


def test_weekend():
    e = frame(date=pd.to_datetime(["2025-03-01", "2025-03-03"]))  # Saturday, Monday
    assert set(t.check_weekend(e)) == {"E0"}


def test_after_hours():
    assert set(t.check_after_hours(frame(hour=[2, 10, 19]), S)) == {"E0", "E2"}


def test_round_numbers():
    assert set(t.check_round_numbers(frame(amount=[5000.0, 5000.5, 500.0]))) == {"E0"}


def test_threshold():
    assert set(t.check_threshold(frame(amount=[9700.0, 10000.0, 5000.0]), S)) == {"E0"}


def test_self_approved():
    assert set(t.check_self_approved(frame(posted_by=["a", "a"], approved_by=["a", "b"]))) == {"E0"}


def test_unusual_pairing():
    e = frame(debit_account=["1100"] * 300 + ["3000"], credit_account=["4000"] * 300 + ["6000"])
    assert set(t.check_unusual_pairing(e, S)) == {"E300"}


def test_benford_detects_uniform_digits():
    amounts = [float(d * 100 + 1) for d in range(1, 10) for _ in range(50)]
    hits, stats = t.check_benford(frame(amount=amounts))
    assert stats["p_value"] < 0.05 and hits
