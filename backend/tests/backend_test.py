"""Backend tests for Workflow Studio: /api/health, /api/, and /api/projects CRUD."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback: read frontend/.env
    from pathlib import Path
    env_path = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def created_ids():
    ids = []
    yield ids
    # teardown
    s = requests.Session()
    for pid in ids:
        try:
            s.delete(f"{BASE_URL}/api/projects/{pid}", timeout=10)
        except Exception:
            pass


# ---------- Health ----------
def test_root(api):
    r = api.get(f"{BASE_URL}/api/", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data.get("service") == "workflow-studio"
    assert data.get("status") == "ok"


def test_health(api):
    r = api.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


# ---------- Projects CRUD ----------
def test_create_project_auto_id(api, created_ids):
    payload = {"name": "TEST_project_auto", "description": "auto id"}
    r = api.post(f"{BASE_URL}/api/projects", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["name"] == "TEST_project_auto"
    assert doc.get("id")
    assert doc.get("createdAt") and doc.get("updatedAt")
    assert doc["storageType"] == "remote"
    created_ids.append(doc["id"])


def test_list_projects_contains_created(api, created_ids):
    assert created_ids, "prerequisite create didn't run"
    r = api.get(f"{BASE_URL}/api/projects", timeout=15)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert created_ids[0] in ids


def test_get_project(api, created_ids):
    pid = created_ids[0]
    r = api.get(f"{BASE_URL}/api/projects/{pid}", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == pid
    assert data["name"] == "TEST_project_auto"
    assert "nodes" in data and "connections" in data


def test_update_preserves_created_at(api, created_ids):
    pid = created_ids[0]
    original = api.get(f"{BASE_URL}/api/projects/{pid}", timeout=15).json()
    time.sleep(1.1)
    update = {
        "name": "TEST_project_updated",
        "description": "updated",
        "createdAt": original["createdAt"],
        "nodes": [{"id": "n1", "type": "start"}],
        "connections": [],
    }
    r = api.put(f"{BASE_URL}/api/projects/{pid}", json=update, timeout=15)
    assert r.status_code == 200
    doc = r.json()
    assert doc["name"] == "TEST_project_updated"
    assert doc["createdAt"] == original["createdAt"]
    assert doc["updatedAt"] != original["updatedAt"]
    # verify persisted
    got = api.get(f"{BASE_URL}/api/projects/{pid}", timeout=15).json()
    assert got["name"] == "TEST_project_updated"
    assert len(got["nodes"]) == 1


def test_get_unknown_returns_404(api):
    r = api.get(f"{BASE_URL}/api/projects/nonexistent-xyz-123", timeout=15)
    assert r.status_code == 404


def test_delete_project(api, created_ids):
    pid = created_ids[0]
    r = api.delete(f"{BASE_URL}/api/projects/{pid}", timeout=15)
    assert r.status_code == 200
    assert r.json().get("deleted") == pid
    r2 = api.get(f"{BASE_URL}/api/projects/{pid}", timeout=15)
    assert r2.status_code == 404
    created_ids.remove(pid)


def test_delete_unknown_returns_404(api):
    r = api.delete(f"{BASE_URL}/api/projects/does-not-exist-abc", timeout=15)
    assert r.status_code == 404


def test_create_with_supplied_id(api, created_ids):
    supplied_id = "TEST-supplied-id-001"
    payload = {"id": supplied_id, "name": "TEST_supplied"}
    r = api.post(f"{BASE_URL}/api/projects", json=payload, timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == supplied_id
    created_ids.append(supplied_id)
    # cleanup by GET
    r2 = api.get(f"{BASE_URL}/api/projects/{supplied_id}", timeout=15)
    assert r2.status_code == 200
