from app.main import app
from fastapi.testclient import TestClient

c = TestClient(app)


def test_sample_run_end_to_end():
    run = c.post("/runs", json={"sample": True}).json()["run"]
    done = c.post(f"/runs/{run['id']}/analyze", json={}).json()
    assert done["status"] == "done" and done["summary"]["flagged"] > 0
    flags = c.get(f"/runs/{run['id']}/flags").json()
    assert flags[0]["score"] >= flags[-1]["score"] and flags[0]["insight"]
    r = c.patch(f"/flags/{flags[0]['id']}", json={"status": "accepted", "comment": "Looks wrong"})
    assert r.json()["status"] == "accepted" and len(r.json()["history"]) == 2
    csv = c.get(f"/runs/{run['id']}/report?format=csv")
    assert csv.status_code == 200 and flags[0]["entry_id"] in csv.text
    assert c.get(f"/runs/{run['id']}/report?format=pdf").content.startswith(b"%PDF")


def test_upload_rejects_bad_columns():
    r = c.post("/runs", json={"filename": "bad.csv"}).json()
    c.put(f"/runs/{r['run']['id']}/upload", content=b"a,b\n1,2\n")
    res = c.post(f"/runs/{r['run']['id']}/analyze", json={})
    assert res.status_code == 422 and "Missing required columns" in res.json()["error"]["message"]


def test_validation_and_evaluation():
    assert c.patch("/flags/x__y", json={}).status_code == 422
    assert c.get("/runs/nope").status_code == 404
    assert "tests" in c.get("/evaluation").json()
