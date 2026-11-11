"""JE Guard API (FastAPI, wrapped by Mangum for AWS Lambda)."""
import json
import logging
import os
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from mangum import Mangum
from pydantic import BaseModel, Field, model_validator

from . import gemini, reports
from .config import ASSETS, MODE, Settings
from .ledger import LedgerError, build_entries, load_ledger
from .scoring import run_pipeline
from .storage import get_store


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:  # structured logs -> CloudWatch
        return json.dumps({"level": record.levelname, "logger": record.name, "msg": record.getMessage()})


handler_ = logging.StreamHandler()
handler_.setFormatter(JsonFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler_], force=True)
log = logging.getLogger("je_guard")

app = FastAPI(title="JE Guard API", version="1.0.0")
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware, allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
        allow_methods=["GET", "POST", "PATCH", "PUT", "OPTIONS"], allow_headers=["*"], expose_headers=["Content-Disposition"])
store = get_store()


class ApiError(Exception):
    def __init__(self, status: int, message: str, next_step: str = "") -> None:
        self.status, self.message, self.next_step = status, message, next_step


@app.exception_handler(ApiError)
async def api_error(_: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": {"message": exc.message, "next_step": exc.next_step}})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    msg = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=422, content={"error": {"message": f"Some inputs are invalid ({msg}).",
                                                            "next_step": "Check the highlighted values and try again."}})


class RunCreate(BaseModel):
    filename: str = Field("ledger.csv", max_length=200)
    sample: bool = False


class AnalyzeRequest(BaseModel):
    settings: Settings | None = None


class FlagPatch(BaseModel):
    status: Literal["open", "accepted", "dismissed"] | None = None
    comment: str | None = Field(None, min_length=1, max_length=1000)

    @model_validator(mode="after")
    def need_one(self) -> "FlagPatch":
        if self.status is None and self.comment is None:
            raise ValueError("send a status or a comment")
        return self


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def get_run_or_404(run_id: str) -> dict:
    run = store.get_run(run_id)
    if not run:
        raise ApiError(404, "That run was not found.", "Start a new run from the Upload screen.")
    return run


@app.get("/health")
def health() -> dict:
    return {"ok": True, "mode": MODE, "synthetic_data_only": True}


@app.post("/runs")
def create_run(body: RunCreate, request: Request) -> dict:
    run = {"id": uuid.uuid4().hex[:12], "filename": "sample_gl.csv" if body.sample else body.filename,
           "status": "created", "created_at": now(), "error": None, "summary": None}
    if body.sample:
        store.copy_sample(run["id"], ASSETS / "sample_gl.csv")
        run["status"] = "uploaded"
    store.save_run(run)
    url = None if body.sample else store.upload_url(run["id"], str(request.base_url))
    log.info("run_created id=%s sample=%s", run["id"], body.sample)
    return {"run": run, "upload_url": url}


@app.put("/runs/{run_id}/upload")
async def local_upload(run_id: str, request: Request) -> dict:
    """Direct upload endpoint (works for local and serverless)."""
    run = get_run_or_404(run_id)
    raw = await request.body()
    if len(raw) > 50_000_000:
        raise ApiError(413, "The file is larger than 50 MB.", "Split the ledger by period and upload again.")
    store.save_upload(run_id, raw)
    run["status"] = "uploaded"
    store.save_run(run)
    return {"ok": True}


@app.post("/runs/{run_id}/analyze")
def analyze(run_id: str, body: AnalyzeRequest | None = None) -> dict:
    run = get_run_or_404(run_id)
    s = (body.settings if body and body.settings else None) or Settings()
    try:
        raw = store.read_upload(run_id)
    except FileNotFoundError:
        raise ApiError(400, "No ledger has been uploaded for this run yet.", "Upload a CSV, then analyze again.") from None
    run.update(status="analyzing", error=None)
    store.save_run(run)
    try:
        df = load_ledger(raw)
        res = run_pipeline(build_entries(df), s)
    except LedgerError as exc:
        run.update(status="failed", error=str(exc))
        store.save_run(run)
        raise ApiError(422, str(exc), "Fix the file and upload it again.") from exc
    out, usage = gemini.analyze(res.flags, res.summary)
    by_id = {i.entry_id: i.model_dump(exclude={"entry_id"}) for i in out.insights}
    flags = [{**f, "id": f"{run_id}__{f['entry_id']}", "run_id": run_id, "insight": by_id.get(f["entry_id"]),
              "status": "open", "comments": [], "history": []} for f in res.flags]
    store.put_flags(run_id, flags)
    run.update(status="done", summary={**res.summary, "rows": len(df), "executive_summary": out.executive_summary,
                                         "ai_used": usage["ai_used"], "usage": {k: usage[k] for k in
                                         ("input_tokens", "output_tokens", "cost_usd", "model")}})
    store.save_run(run)
    log.info("run_done id=%s entries=%s flagged=%s cost=%s", run_id, res.summary["entries_tested"], len(flags), usage["cost_usd"])
    return run


@app.get("/runs")
def list_runs() -> list[dict]:
    return [{k: r[k] for k in ("id", "filename", "status", "created_at")} for r in store.list_runs()]


@app.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    return get_run_or_404(run_id)


@app.get("/runs/{run_id}/flags")
def get_flags(run_id: str) -> list[dict]:
    get_run_or_404(run_id)
    return store.list_flags(run_id)


@app.patch("/flags/{flag_id}")
def patch_flag(flag_id: str, body: FlagPatch, x_auditor: str = Header("auditor")) -> dict:
    flag = store.get_flag(flag_id)
    if not flag:
        raise ApiError(404, "That flag was not found.", "Reload the Flags screen.")
    who, when = x_auditor[:60], now()
    if body.status and body.status != flag["status"]:
        what = {"open": "Reopened (undo)", "accepted": "Accepted as a finding", "dismissed": "Dismissed"}[body.status]
        flag["history"].append({"who": who, "what": what, "when": when})
        flag["status"] = body.status
    if body.comment:
        flag["comments"].append({"who": who, "text": body.comment, "when": when})
        flag["history"].append({"who": who, "what": "Added a comment", "when": when})
    store.save_flag(flag)
    return flag


@app.get("/runs/{run_id}/report")
def report(run_id: str, format: Literal["csv", "pdf"] = "csv", ids: str = "", include_ai: bool = True) -> Response:
    run = get_run_or_404(run_id)
    wanted = {i for i in ids.split(",") if i}
    flags = [f for f in store.list_flags(run_id) if f["status"] == "accepted" and (not wanted or f["entry_id"] in wanted)]
    if not flags:
        raise ApiError(400, "There are no accepted findings to export.", "Accept at least one flag, then download again.")
    data = reports.to_pdf(run, flags, include_ai) if format == "pdf" else reports.to_csv(flags, include_ai)
    name = f"je-guard-{run_id}.{format}"
    store.save_export(run_id, name, data)
    return Response(data, media_type="application/pdf" if format == "pdf" else "text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.get("/evaluation")
def evaluation() -> dict:
    p = ASSETS / "eval_results.json"
    if not p.exists():
        raise ApiError(404, "No evaluation results are available.", "Run `python data/evaluate.py` and redeploy.")
    return json.loads(p.read_text())


handler = Mangum(app, lifespan="off")  # AWS Lambda entry point
