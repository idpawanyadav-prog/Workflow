"""Backend pytest suite for Workflow Studio (Python-migrated FastAPI backend).

Covers:
- Health endpoint
- Projects CRUD: list, create, get, update (rename/description), delete
- Graph save endpoint
- Project import endpoint
- 404 error branches
"""
import os
import time
import uuid
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = (BASE_URL or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def created_ids():
    ids: list[str] = []
    yield ids
    s = requests.Session()
    for pid in ids:
        try:
            s.delete(f"{API}/projects/{pid}", timeout=10)
        except Exception:
            pass


# ---------- Health ----------
def test_health(api):
    r = api.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["service"] == "workflow-studio"
    assert data["storage"] == "mongo"


# ---------- Create + List + Get ----------
def test_create_project(api, created_ids):
    payload = {"name": "TEST_wf_project", "description": "auto"}
    r = api.post(f"{API}/projects", json=payload, timeout=15)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["name"] == "TEST_wf_project"
    assert doc["description"] == "auto"
    assert isinstance(doc["id"], str) and len(doc["id"]) > 0
    assert doc["createdAt"] and doc["updatedAt"]
    assert doc["graph"] == {"nodes": [], "connections": []}
    assert "_id" not in doc
    created_ids.append(doc["id"])


def test_list_projects_includes_created(api, created_ids):
    assert created_ids
    r = api.get(f"{API}/projects", timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    match = next((p for p in items if p["id"] == created_ids[0]), None)
    assert match is not None
    assert match["nodeCount"] == 0
    assert match["connectionCount"] == 0
    assert "_id" not in match


def test_get_project(api, created_ids):
    pid = created_ids[0]
    r = api.get(f"{API}/projects/{pid}", timeout=15)
    assert r.status_code == 200
    doc = r.json()
    assert doc["id"] == pid
    assert doc["name"] == "TEST_wf_project"
    assert "graph" in doc


def test_get_unknown_returns_404(api):
    r = api.get(f"{API}/projects/does-not-exist-{uuid.uuid4()}", timeout=15)
    assert r.status_code == 404


# ---------- Update ----------
def test_update_project_rename(api, created_ids):
    pid = created_ids[0]
    original = api.get(f"{API}/projects/{pid}", timeout=15).json()
    time.sleep(1.1)
    r = api.put(
        f"{API}/projects/{pid}",
        json={"name": "TEST_wf_project_renamed", "description": "new desc"},
        timeout=15,
    )
    assert r.status_code == 200
    doc = r.json()
    assert doc["name"] == "TEST_wf_project_renamed"
    assert doc["description"] == "new desc"
    assert doc["updatedAt"] != original["updatedAt"]
    # persistence check
    got = api.get(f"{API}/projects/{pid}", timeout=15).json()
    assert got["name"] == "TEST_wf_project_renamed"


def test_update_unknown_returns_404(api):
    r = api.put(f"{API}/projects/nope-{uuid.uuid4()}", json={"name": "x"}, timeout=15)
    assert r.status_code == 404


# ---------- Graph save ----------
def test_save_graph(api, created_ids):
    pid = created_ids[0]
    graph = {
        "nodes": [
            {"id": "n1", "type": "start", "x": 100, "y": 100, "label": "Start"},
            {"id": "n2", "type": "process", "x": 300, "y": 100, "label": "Do"},
        ],
        "connections": [{"id": "c1", "source": "n1", "target": "n2"}],
    }
    r = api.put(f"{API}/projects/{pid}/graph", json=graph, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["saved"] is True
    assert body["updatedAt"]

    # verify persisted graph via GET and list nodeCount
    got = api.get(f"{API}/projects/{pid}", timeout=15).json()
    assert len(got["graph"]["nodes"]) == 2
    assert len(got["graph"]["connections"]) == 1
    listed = api.get(f"{API}/projects", timeout=15).json()
    match = next(p for p in listed if p["id"] == pid)
    assert match["nodeCount"] == 2
    assert match["connectionCount"] == 1


def test_save_graph_unknown_returns_404(api):
    r = api.put(
        f"{API}/projects/nope-{uuid.uuid4()}/graph",
        json={"nodes": [], "connections": []},
        timeout=15,
    )
    assert r.status_code == 404


# ---------- Import ----------
def test_import_project(api, created_ids):
    payload = {
        "name": "TEST_wf_imported",
        "description": "imported",
        "graph": {
            "nodes": [{"id": "s", "type": "start"}],
            "connections": [],
        },
    }
    r = api.post(f"{API}/projects/import", json=payload, timeout=15)
    assert r.status_code == 201
    doc = r.json()
    assert doc["name"] == "TEST_wf_imported"
    assert len(doc["graph"]["nodes"]) == 1
    assert doc["id"]
    created_ids.append(doc["id"])
    got = api.get(f"{API}/projects/{doc['id']}", timeout=15).json()
    assert got["name"] == "TEST_wf_imported"


# ---------- Delete ----------
def test_delete_project(api, created_ids):
    pid = created_ids[0]
    r = api.delete(f"{API}/projects/{pid}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("deleted") is True
    r2 = api.get(f"{API}/projects/{pid}", timeout=15)
    assert r2.status_code == 404
    created_ids.remove(pid)


def test_delete_unknown_returns_404(api):
    r = api.delete(f"{API}/projects/does-not-exist-{uuid.uuid4()}", timeout=15)
    assert r.status_code == 404


# ---------- Validation ----------
def test_create_project_missing_name_returns_422(api):
    r = api.post(f"{API}/projects", json={"description": "no name"}, timeout=15)
    assert r.status_code == 422
