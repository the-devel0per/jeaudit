"""Gemini analysis. Called ONLY from the backend; only top flagged entries + aggregate stats are sent."""
import json
import logging
import os
from typing import Literal

import httpx
from pydantic import BaseModel, ValidationError

log = logging.getLogger("je_guard.gemini")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")  # fast Flash model for Lambda compatibility
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
# Estimated USD per 1M tokens (override via env if pricing changes)
PRICE_IN = float(os.getenv("GEMINI_PRICE_IN", "0.30"))
PRICE_OUT = float(os.getenv("GEMINI_PRICE_OUT", "2.50"))
TOP_N = 20


class Insight(BaseModel):
    entry_id: str
    plain_english_explanation: str
    likely_risk_scenario: str
    suggested_audit_procedure: str
    confidence: Literal["low", "medium", "high"]


class GeminiOutput(BaseModel):
    executive_summary: str
    insights: list[Insight]


def api_key() -> str | None:
    if os.getenv("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    secret = os.getenv("GEMINI_SECRET_ID")
    if secret:
        import boto3
        return boto3.client("secretsmanager").get_secret_value(SecretId=secret)["SecretString"].strip()
    return None


def _prompt(top: list[dict], stats: dict) -> str:
    entries = [{"entry_id": f["entry_id"], **f["entry"], "risk_score": f["score"],
                "tests_fired": [h["reason"] for h in f["hits"]]} for f in top]
    agg = {k: stats[k] for k in ("entries_tested", "flagged", "high_risk", "value_at_risk")}
    agg["tests_triggered"] = {t["label"]: t["count"] for t in stats["tests"]}
    agg["benford_p_value"] = round(stats["benford"]["p_value"], 4)
    return ("You are an audit assistant helping an external auditor review journal entries (synthetic data). "
            "Return ONLY JSON: {\"executive_summary\": one paragraph about the whole run, \"insights\": [one object per "
            "entry with keys entry_id, plain_english_explanation, likely_risk_scenario, suggested_audit_procedure, "
            "confidence (low|medium|high)]}. Be factual; do not accuse anyone of fraud.\n"
            f"RUN STATS: {json.dumps(agg)}\nTOP ENTRIES: {json.dumps(entries)}")


def _call(prompt: str, key: str) -> tuple[str, int, int]:
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    r = httpx.post(URL, json=body, headers={"x-goog-api-key": key}, timeout=60)
    r.raise_for_status()
    data = r.json()
    usage = data.get("usageMetadata", {})
    return data["candidates"][0]["content"]["parts"][0]["text"], usage.get("promptTokenCount", 0), usage.get("candidatesTokenCount", 0)


def offline(top: list[dict], stats: dict) -> GeminiOutput:
    """Deterministic fallback when no Gemini key is configured (keeps the app usable locally)."""
    ins = [Insight(entry_id=f["entry_id"],
                   plain_english_explanation="This entry triggered: " + "; ".join(h["reason"] for h in f["hits"]) + ".",
                   likely_risk_scenario="Possible control override or management bias. Template text: Gemini is not configured.",
                   suggested_audit_procedure="Inspect supporting documents and confirm approval evidence with the preparer.",
                   confidence="low") for f in top]
    s = (f"{stats['flagged']:,} of {stats['entries_tested']:,} entries were flagged and {stats['high_risk']:,} are high risk, "
         f"with {stats['value_at_risk']:,.0f} in total value. (Template summary: add a Gemini key for an AI-written one.)")
    return GeminiOutput(executive_summary=s, insights=ins)


def analyze(flags: list[dict], stats: dict) -> tuple[GeminiOutput, dict]:
    top = flags[:TOP_N]
    key = api_key()
    usage = {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "model": MODEL}
    if not key or not top:
        return offline(top, stats), {**usage, "ai_used": False}
    prompt, tin, tout = _prompt(top, stats), 0, 0
    for attempt in range(3):  # retry on invalid JSON / schema mismatch
        try:
            text, a, b = _call(prompt, key)
            tin, tout = tin + a, tout + b
            out = GeminiOutput.model_validate_json(text.strip().removeprefix("```json").removesuffix("```"))
            usage.update(input_tokens=tin, output_tokens=tout, ai_used=True,
                         cost_usd=round(tin / 1e6 * PRICE_IN + tout / 1e6 * PRICE_OUT, 5))
            return out, usage
        except (ValidationError, ValueError, KeyError) as exc:
            log.warning("gemini_invalid_output attempt=%s error=%s", attempt + 1, str(exc)[:200])
            prompt += "\nYour previous reply was not valid JSON for the schema. Return only the JSON object."
        except httpx.HTTPError as exc:
            log.error("gemini_http_error %s", exc)
            break
    return offline(top, stats), {**usage, "input_tokens": tin, "output_tokens": tout, "ai_used": False}
