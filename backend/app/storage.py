"""Persistence. LocalStore uses files; AwsStore uses S3 (uploads/exports) + DynamoDB (runs, flags, reviews)."""
import json
import os
import shutil
from pathlib import Path

from .config import MODE


class LocalStore:
    def __init__(self) -> None:
        default_dir = "/tmp/je_guard" if os.getenv("AWS_LAMBDA_FUNCTION_NAME") else ".local"
        self.root = Path(os.getenv("JE_GUARD_DATA", default_dir))
        (self.root / "runs").mkdir(parents=True, exist_ok=True)

    def _dir(self, run_id: str) -> Path:
        d = self.root / "runs" / run_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def upload_url(self, run_id: str, base_url: str) -> str:
        return f"{base_url}runs/{run_id}/upload"

    def save_upload(self, run_id: str, raw: bytes) -> None:
        (self._dir(run_id) / "ledger.csv").write_bytes(raw)

    def read_upload(self, run_id: str) -> bytes:
        return (self._dir(run_id) / "ledger.csv").read_bytes()

    def save_run(self, run: dict) -> None:
        (self._dir(run["id"]) / "run.json").write_text(json.dumps(run))

    def get_run(self, run_id: str) -> dict | None:
        p = self.root / "runs" / run_id / "run.json"
        return json.loads(p.read_text()) if p.exists() else None

    def list_runs(self) -> list[dict]:
        runs = [json.loads(p.read_text()) for p in (self.root / "runs").glob("*/run.json")]
        return sorted(runs, key=lambda r: r["created_at"], reverse=True)

    def put_flags(self, run_id: str, flags: list[dict]) -> None:
        (self._dir(run_id) / "flags.json").write_text(json.dumps({f["id"]: f for f in flags}))

    def list_flags(self, run_id: str) -> list[dict]:
        p = self.root / "runs" / run_id / "flags.json"
        return sorted(json.loads(p.read_text()).values(), key=lambda f: -f["score"]) if p.exists() else []

    def get_flag(self, flag_id: str) -> dict | None:
        run_id = flag_id.split("__")[0]
        p = self.root / "runs" / run_id / "flags.json"
        return json.loads(p.read_text()).get(flag_id) if p.exists() else None

    def save_flag(self, flag: dict) -> None:
        p = self._dir(flag["run_id"]) / "flags.json"
        data = json.loads(p.read_text())
        data[flag["id"]] = flag
        p.write_text(json.dumps(data))

    def save_export(self, run_id: str, name: str, data: bytes) -> None:
        (self._dir(run_id) / name).write_bytes(data)

    def copy_sample(self, run_id: str, src: Path) -> None:
        shutil.copy(src, self._dir(run_id) / "ledger.csv")


class AwsStore:
    """Single DynamoDB table: pk=run_id, sk='RUN' or 'FLAG#<entry_id>', data=JSON string with local fallback."""

    def __init__(self) -> None:
        import boto3
        self.fallback = LocalStore()
        self.bucket = os.getenv("BUCKET", "")
        self.table_name = os.getenv("TABLE", "")
        try:
            self.s3 = boto3.client("s3") if self.bucket else None
            self.table = boto3.resource("dynamodb").Table(self.table_name) if self.table_name else None
        except Exception:
            self.s3 = None
            self.table = None

    def upload_url(self, run_id: str, base_url: str) -> str:
        # Route uploads through the API to avoid S3 browser CORS issues
        return self.fallback.upload_url(run_id, base_url)

    def save_upload(self, run_id: str, raw: bytes) -> None:
        if self.s3 and self.bucket:
            try:
                self.s3.put_object(Bucket=self.bucket, Key=f"uploads/{run_id}.csv", Body=raw)
                return
            except Exception:
                pass
        self.fallback.save_upload(run_id, raw)

    def read_upload(self, run_id: str) -> bytes:
        if self.s3 and self.bucket:
            try:
                return self.s3.get_object(Bucket=self.bucket, Key=f"uploads/{run_id}.csv")["Body"].read()
            except Exception:
                pass
        return self.fallback.read_upload(run_id)

    def save_run(self, run: dict) -> None:
        self.fallback.save_run(run)
        if self.table:
            try:
                self.table.put_item(Item={"pk": run["id"], "sk": "RUN", "created_at": run["created_at"], "data": json.dumps(run)})
            except Exception:
                pass

    def get_run(self, run_id: str) -> dict | None:
        if self.table:
            try:
                item = self.table.get_item(Key={"pk": run_id, "sk": "RUN"}).get("Item")
                if item:
                    return json.loads(item["data"])
            except Exception:
                pass
        return self.fallback.get_run(run_id)

    def list_runs(self) -> list[dict]:
        if self.table:
            try:
                items = self.table.scan(FilterExpression="sk = :s", ExpressionAttributeValues={":s": "RUN"}).get("Items", [])
                if items:
                    return sorted((json.loads(i["data"]) for i in items), key=lambda r: r["created_at"], reverse=True)
            except Exception:
                pass
        return self.fallback.list_runs()

    def put_flags(self, run_id: str, flags: list[dict]) -> None:
        self.fallback.put_flags(run_id, flags)
        if self.table:
            try:
                from boto3.dynamodb.conditions import Key
                old = self.table.query(KeyConditionExpression=Key("pk").eq(run_id) & Key("sk").begins_with("FLAG#"))["Items"]
                with self.table.batch_writer() as bw:
                    for o in old:
                        bw.delete_item(Key={"pk": o["pk"], "sk": o["sk"]})
                    for f in flags:
                        bw.put_item(Item={"pk": run_id, "sk": f"FLAG#{f['entry_id']}", "data": json.dumps(f)})
            except Exception:
                pass

    def list_flags(self, run_id: str) -> list[dict]:
        if self.table:
            try:
                from boto3.dynamodb.conditions import Key
                items, kwargs = [], {"KeyConditionExpression": Key("pk").eq(run_id) & Key("sk").begins_with("FLAG#")}
                while True:
                    page = self.table.query(**kwargs)
                    items += page["Items"]
                    if "LastEvaluatedKey" not in page:
                        break
                    kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
                if items:
                    return sorted((json.loads(i["data"]) for i in items), key=lambda f: -f["score"])
            except Exception:
                pass
        return self.fallback.list_flags(run_id)

    def get_flag(self, flag_id: str) -> dict | None:
        if self.table:
            try:
                run_id, entry_id = flag_id.split("__", 1)
                item = self.table.get_item(Key={"pk": run_id, "sk": f"FLAG#{entry_id}"}).get("Item")
                if item:
                    return json.loads(item["data"])
            except Exception:
                pass
        return self.fallback.get_flag(flag_id)

    def save_flag(self, flag: dict) -> None:
        self.fallback.save_flag(flag)
        if self.table:
            try:
                self.table.put_item(Item={"pk": flag["run_id"], "sk": f"FLAG#{flag['entry_id']}", "data": json.dumps(flag)})
            except Exception:
                pass

    def save_export(self, run_id: str, name: str, data: bytes) -> None:
        self.fallback.save_export(run_id, name, data)
        if self.s3 and self.bucket:
            try:
                self.s3.put_object(Bucket=self.bucket, Key=f"exports/{run_id}/{name}", Body=data)
            except Exception:
                pass

    def copy_sample(self, run_id: str, src: Path) -> None:
        self.fallback.copy_sample(run_id, src)
        if self.s3 and self.bucket:
            try:
                self.save_upload(run_id, src.read_bytes())
            except Exception:
                pass


def get_store() -> LocalStore | AwsStore:
    return AwsStore() if MODE == "aws" else LocalStore()
