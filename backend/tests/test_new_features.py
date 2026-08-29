"""Backend tests for new features: attachments and AI workflow draft."""
import io
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
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    return s


# ---------- Attachments ----------
class TestAttachments:
    def test_upload_small_image(self, api):
        # 1x1 PNG
        png = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000d49444154789c626000000000050001a5f645400000000049454e44ae426082"
        )
        files = {"file": ("TEST_pixel.png", png, "image/png")}
        r = api.post(f"{API}/attachments", files=files, timeout=60)
        assert r.status_code == 201, r.text
        doc = r.json()
        assert doc["name"] == "TEST_pixel.png"
        assert doc["contentType"] == "image/png"
        assert doc["size"] == len(png)
        assert doc["url"] == f"/api/attachments/{doc['id']}"
        pytest.att_id = doc["id"]
        pytest.att_bytes = png

    def test_download_attachment(self, api):
        aid = pytest.att_id
        r = api.get(f"{API}/attachments/{aid}", timeout=60)
        assert r.status_code == 200
        assert r.content == pytest.att_bytes
        assert "image/png" in r.headers.get("Content-Type", "")

    def test_upload_text_file(self, api):
        data = b"hello workflow attachments"
        files = {"file": ("TEST_notes.txt", data, "text/plain")}
        r = api.post(f"{API}/attachments", files=files, timeout=60)
        assert r.status_code == 201
        doc = r.json()
        assert doc["contentType"] == "text/plain"
        pytest.txt_id = doc["id"]
        g = api.get(f"{API}/attachments/{doc['id']}", timeout=60)
        assert g.status_code == 200
        assert g.content == data

    def test_delete_attachment(self, api):
        aid = pytest.txt_id
        r = api.delete(f"{API}/attachments/{aid}", timeout=30)
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        g = api.get(f"{API}/attachments/{aid}", timeout=30)
        assert g.status_code == 404

    def test_reject_empty_file(self, api):
        files = {"file": ("TEST_empty.txt", b"", "text/plain")}
        r = api.post(f"{API}/attachments", files=files, timeout=30)
        assert r.status_code == 400

    def test_reject_oversize_file(self, api):
        big = b"x" * (10 * 1024 * 1024 + 100)
        files = {"file": ("TEST_big.bin", big, "application/octet-stream")}
        r = api.post(f"{API}/attachments", files=files, timeout=120)
        assert r.status_code == 413

    def test_download_unknown_returns_404(self, api):
        r = api.get(f"{API}/attachments/nope-{uuid.uuid4()}", timeout=30)
        assert r.status_code == 404


# ---------- AI draft ----------
class TestAIDraft:
    def test_ai_draft_generates_graph(self, api):
        prompt = (
            "Customer places an order. Check stock in database. If in stock, "
            "charge card via payment API and email confirmation, otherwise "
            "notify customer. Then end."
        )
        r = api.post(f"{API}/ai/draft", json={"prompt": prompt}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "nodes" in data and "connections" in data
        nodes = data["nodes"]
        conns = data["connections"]
        assert len(nodes) >= 3, f"too few nodes: {len(nodes)}"
        types = [n["type"] for n in nodes]
        assert "start" in types
        assert "end" in types
        # exactly one start
        assert types.count("start") == 1
        # valid types
        valid = {"start","end","process","decision","database","api","document","delay","email","subflow"}
        for n in nodes:
            assert n["type"] in valid
            assert isinstance(n["id"], str) and len(n["id"]) >= 8  # uuid
            assert "title" in n
            assert "position" in n and "x" in n["position"] and "y" in n["position"]
        # if any decision, labels should be Yes/No
        node_by_id = {n["id"]: n for n in nodes}
        dec_conns = {}
        for c in conns:
            assert c["source"] in node_by_id and c["target"] in node_by_id
            src_type = node_by_id[c["source"]]["type"]
            if src_type == "decision":
                dec_conns.setdefault(c["source"], []).append(c.get("label", ""))
        for src, labels in dec_conns.items():
            assert set(labels).issubset({"Yes", "No", ""})
            assert len(labels) <= 2

    def test_ai_draft_short_prompt_422(self, api):
        r = api.post(f"{API}/ai/draft", json={"prompt": "hi"}, timeout=30)
        assert r.status_code == 422
