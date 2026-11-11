"""Load + validate a general ledger CSV and collapse its lines into journal entries."""
import io

import pandas as pd

REQUIRED = ["entry_id", "posting_date", "posting_time", "account", "debit", "credit",
            "description", "posted_by", "approved_by", "amount"]
MAX_ROWS = 200_000


class LedgerError(ValueError):
    """Raised with an auditor-friendly message when the file cannot be used."""


def load_ledger(raw: bytes) -> pd.DataFrame:
    try:
        df = pd.read_csv(io.BytesIO(raw), dtype={"entry_id": str, "account": str})
    except Exception as exc:
        raise LedgerError("The file could not be read as a CSV.") from exc
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise LedgerError(f"Missing required columns: {', '.join(missing)}.")
    if df.empty:
        raise LedgerError("The file has no rows.")
    if len(df) > MAX_ROWS:
        raise LedgerError(f"The file has {len(df):,} rows; the limit is {MAX_ROWS:,}.")
    for col in ("debit", "credit", "amount"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
        if df[col].isna().any():
            raise LedgerError(f"Column '{col}' contains non-numeric values.")
    if pd.to_datetime(df["posting_date"], errors="coerce").isna().any():
        raise LedgerError("Column 'posting_date' contains invalid dates (use YYYY-MM-DD).")
    hours = pd.to_numeric(df["posting_time"].astype(str).str.split(":").str[0], errors="coerce")
    if hours.isna().any() or (hours > 23).any():
        raise LedgerError("Column 'posting_time' must look like HH:MM:SS.")
    return df


def build_entries(df: pd.DataFrame) -> pd.DataFrame:
    """One row per journal entry, indexed by entry_id."""
    df = df.copy()
    df["posting_date"] = pd.to_datetime(df["posting_date"])
    df["account"] = df["account"].astype(str)
    base = df.groupby("entry_id").agg(
        date=("posting_date", "first"), posting_time=("posting_time", "first"),
        amount=("amount", "first"), description=("description", "first"),
        posted_by=("posted_by", "first"), approved_by=("approved_by", "first"))
    deb = df[df["debit"] > 0].groupby("entry_id")["account"].first().rename("debit_account")
    cre = df[df["credit"] > 0].groupby("entry_id")["account"].first().rename("credit_account")
    e = base.join(deb).join(cre)
    e["debit_account"] = e["debit_account"].fillna("?")
    e["credit_account"] = e["credit_account"].fillna("?")
    e["approved_by"] = e["approved_by"].fillna("").astype(str)
    e["posted_by"] = e["posted_by"].fillna("").astype(str)
    e["description"] = e["description"].fillna("").astype(str)
    e["hour"] = e["posting_time"].astype(str).str.split(":").str[0].astype(int)
    e["amount"] = e["amount"].abs()
    return e
