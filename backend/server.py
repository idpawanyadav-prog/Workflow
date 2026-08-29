"""Workflow Studio API - fully Python backend (FastAPI).

Storage backends:
- mongo  : used in the cloud preview (MONGO_URL from .env)
- sqlite : used for local runs (python run_local.py) - zero external services
"""
import asyncio
import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from samples import SAMPLE_IDS, seed_sample_projects

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workflow-studio")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class GraphPayload(BaseModel):
    nodes: list[dict] = []
    connections: list[dict] = []


class ProjectImport(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    graph: GraphPayload = GraphPayload()


# ---------------- storage backends ----------------
class MongoStorage:
    def __init__(self, url: str, db_name: str):
        from motor.motor_asyncio import AsyncIOMotorClient
        self.client = AsyncIOMotorClient(url)
        self.col = self.client[db_name].projects
        self.files = self.client[db_name].attachments

    async def insert_file(self, rec: dict) -> None:
        await self.files.insert_one({**rec, "_id": rec["id"]})

    async def get_file(self, aid: str) -> dict | None:
        doc = await self.files.find_one({"id": aid, "isDeleted": False})
        if doc:
            doc.pop("_id", None)
        return doc

    async def delete_file(self, aid: str) -> bool:
        res = await self.files.update_one({"id": aid}, {"$set": {"isDeleted": True}})
        return res.matched_count > 0

    async def list(self) -> list[dict]:
        out = []
        async for doc in self.col.find().sort("updatedAt", -1):
            doc.pop("_id", None)
            out.append(doc)
        return out

    async def get(self, pid: str) -> dict | None:
        doc = await self.col.find_one({"id": pid})
        if doc:
            doc.pop("_id", None)
        return doc

    async def insert(self, doc: dict) -> None:
        await self.col.insert_one({**doc, "_id": doc["id"]})

    async def update(self, pid: str, updates: dict) -> dict | None:
        res = await self.col.find_one_and_update(
            {"id": pid}, {"$set": updates}, return_document=True
        )
        if res:
            res.pop("_id", None)
        return res

    async def delete(self, pid: str) -> bool:
        res = await self.col.delete_one({"id": pid})
        return res.deleted_count > 0

    def close(self) -> None:
        self.client.close()


class SQLiteStorage:
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
                createdAt TEXT, updatedAt TEXT, graph TEXT DEFAULT '{}')"""
        )
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS attachments (
                id TEXT PRIMARY KEY, name TEXT, contentType TEXT, size INTEGER,
                storagePath TEXT, backend TEXT, isDeleted INTEGER DEFAULT 0, createdAt TEXT)"""
        )
        self.conn.commit()

    async def insert_file(self, rec: dict) -> None:
        self.conn.execute(
            "INSERT INTO attachments (id,name,contentType,size,storagePath,backend,isDeleted,createdAt) VALUES (?,?,?,?,?,?,0,?)",
            (rec["id"], rec["name"], rec["contentType"], rec["size"], rec["storagePath"], rec["backend"], rec["createdAt"]),
        )
        self.conn.commit()

    async def get_file(self, aid: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM attachments WHERE id=? AND isDeleted=0", (aid,)).fetchone()
        return dict(row) if row else None

    async def delete_file(self, aid: str) -> bool:
        cur = self.conn.execute("UPDATE attachments SET isDeleted=1 WHERE id=?", (aid,))
        self.conn.commit()
        return cur.rowcount > 0

    @staticmethod
    def _row_to_doc(row: sqlite3.Row) -> dict:
        d = dict(row)
        d["graph"] = json.loads(d.get("graph") or "{}")
        return d

    async def list(self) -> list[dict]:
        rows = self.conn.execute("SELECT * FROM projects ORDER BY updatedAt DESC").fetchall()
        return [self._row_to_doc(r) for r in rows]

    async def get(self, pid: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        return self._row_to_doc(row) if row else None

    async def insert(self, doc: dict) -> None:
        self.conn.execute(
            "INSERT INTO projects (id,name,description,createdAt,updatedAt,graph) VALUES (?,?,?,?,?,?)",
            (doc["id"], doc["name"], doc["description"], doc["createdAt"],
             doc["updatedAt"], json.dumps(doc["graph"])),
        )
        self.conn.commit()

    async def update(self, pid: str, updates: dict) -> dict | None:
        if not await self.get(pid):
            return None
        cols, vals = [], []
        for k, v in updates.items():
            cols.append(f"{k}=?")
            vals.append(json.dumps(v) if k == "graph" else v)
        vals.append(pid)
        self.conn.execute(f"UPDATE projects SET {', '.join(cols)} WHERE id=?", vals)
        self.conn.commit()
        return await self.get(pid)

    async def delete(self, pid: str) -> bool:
        cur = self.conn.execute("DELETE FROM projects WHERE id=?", (pid,))
        self.conn.commit()
        return cur.rowcount > 0

    def close(self) -> None:
        self.conn.close()


STORAGE_KIND = os.environ.get(
    "WORKFLOW_STORAGE", "mongo" if os.environ.get("MONGO_URL") else "sqlite"
)
if STORAGE_KIND == "mongo":
    storage = MongoStorage(os.environ["MONGO_URL"], os.environ["DB_NAME"])
else:
    storage = SQLiteStorage(os.environ.get("WORKFLOW_DB_PATH", str(ROOT_DIR / "workflow_studio.db")))
logger.info("Workflow Studio storage backend: %s", STORAGE_KIND)

# ---------------- attachments (object storage in cloud, disk locally) ----------------
OBJSTORE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
OBJSTORE_URL = OBJSTORE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
OBJSTORE_ENABLED = bool(EMERGENT_KEY) and STORAGE_KIND == "mongo"
UPLOADS_DIR = Path(os.environ.get("WORKFLOW_UPLOADS_DIR", str(ROOT_DIR / "uploads")))
MAX_ATTACHMENT = 10 * 1024 * 1024
_objstore_key = None


def init_objstore(force: bool = False) -> str:
    global _objstore_key
    if _objstore_key and not force:
        return _objstore_key
    resp = requests.post(f"{OBJSTORE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _objstore_key = resp.json()["storage_key"]
    return _objstore_key


def objstore_put(path: str, data: bytes, content_type: str) -> dict:
    resp = requests.put(
        f"{OBJSTORE_URL}/objects/{path}",
        headers={"X-Storage-Key": init_objstore(), "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        resp = requests.put(
            f"{OBJSTORE_URL}/objects/{path}",
            headers={"X-Storage-Key": init_objstore(force=True), "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def objstore_get(path: str):
    resp = requests.get(f"{OBJSTORE_URL}/objects/{path}", headers={"X-Storage-Key": init_objstore()}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------- AI workflow drafting ----------------
VALID_NODE_TYPES = {"start", "end", "process", "decision", "database", "api", "document", "delay", "email", "subflow", "custom"}
AI_SYSTEM = (
    "You convert a plain-text process description into a workflow graph.\n"
    "Available node types: start, end, process, decision, database, api, document, delay, email, subflow.\n"
    "Rules: exactly ONE start node; at least one end node; a decision node has exactly TWO outgoing "
    "connections (first = Yes branch, second = No branch); every other node type has at most ONE outgoing "
    "connection; the start node has no incoming connections; every node must be reachable from start.\n"
    "Give each node a concise title (max 6 words) and a one-sentence shortDescription.\n"
    "Respond with ONLY raw JSON, no markdown fences, in this exact shape:\n"
    '{"nodes":[{"id":"n1","type":"start","title":"...","shortDescription":"..."}],'
    '"connections":[{"source":"n1","target":"n2"}]}'
)


def parse_ai_graph(text: str) -> dict:
    a, b = text.find("{"), text.rfind("}")
    if a < 0 or b <= a:
        return {"nodes": [], "connections": []}
    try:
        data = json.loads(text[a:b + 1])
    except json.JSONDecodeError:
        return {"nodes": [], "connections": []}
    idmap, nodes = {}, []
    seen_start = False
    for i, nd in enumerate(data.get("nodes", [])):
        if not isinstance(nd, dict):
            continue
        t = str(nd.get("type", "process")).lower()
        if t not in VALID_NODE_TYPES:
            t = "process"
        if t == "start":
            if seen_start:
                t = "process"
            seen_start = True
        nid = str(uuid.uuid4())
        idmap[str(nd.get("id", i))] = nid
        nodes.append({
            "id": nid, "type": t,
            "title": str(nd.get("title", "Step"))[:80],
            "shortDescription": str(nd.get("shortDescription", ""))[:240],
            "detailedDescription": "", "attachments": [],
            "position": {"x": 80, "y": 80 + i * 150},
        })
    type_of = {n["id"]: n["type"] for n in nodes}
    out_count: dict[str, int] = {}
    conns = []
    for c in data.get("connections", []):
        if not isinstance(c, dict):
            continue
        s, t2 = idmap.get(str(c.get("source"))), idmap.get(str(c.get("target")))
        if not s or not t2 or s == t2 or type_of[s] == "end":
            continue
        max_out = 2 if type_of[s] == "decision" else 1
        if out_count.get(s, 0) >= max_out:
            continue
        label = ""
        if type_of[s] == "decision":
            label = "Yes" if out_count.get(s, 0) == 0 else "No"
        conns.append({"id": str(uuid.uuid4()), "source": s, "sourceDir": "bottom",
                      "target": t2, "targetDir": "top", "label": label})
        out_count[s] = out_count.get(s, 0) + 1
    return {"nodes": nodes, "connections": conns}


class DraftRequest(BaseModel):
    prompt: str = Field(min_length=5, max_length=3000)
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    provider: str | None = None


class AiTestRequest(BaseModel):
    base_url: str | None = None
    api_key: str = Field(min_length=1, max_length=400)
    model: str | None = None
    provider: str | None = None


app = FastAPI(title="Workflow Studio API")
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {"status": "ok", "service": "workflow-studio", "storage": STORAGE_KIND}


@api.get("/projects")
async def list_projects():
    out = []
    for doc in await storage.list():
        graph = doc.get("graph") or {}
        out.append({
            "id": doc["id"],
            "name": doc["name"],
            "description": doc.get("description", ""),
            "createdAt": doc.get("createdAt"),
            "updatedAt": doc.get("updatedAt"),
            "nodeCount": len(graph.get("nodes", [])),
            "connectionCount": len(graph.get("connections", [])),
        })
    return out


@api.post("/projects", status_code=201)
async def create_project(body: ProjectCreate):
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "description": body.description.strip(),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "graph": {"nodes": [], "connections": []},
    }
    await storage.insert(doc)
    return doc


@api.get("/projects/{pid}")
async def get_project(pid: str):
    doc = await storage.get(pid)
    if not doc:
        raise HTTPException(404, "Project not found")
    return doc


@api.put("/projects/{pid}")
async def update_project(pid: str, body: ProjectUpdate):
    updates: dict[str, Any] = {"updatedAt": now_iso()}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.description is not None:
        updates["description"] = body.description.strip()
    res = await storage.update(pid, updates)
    if not res:
        raise HTTPException(404, "Project not found")
    return res


@api.delete("/projects/{pid}")
async def delete_project(pid: str):
    if not await storage.delete(pid):
        raise HTTPException(404, "Project not found")
    return {"deleted": True}


@api.put("/projects/{pid}/graph")
async def save_graph(pid: str, body: GraphPayload):
    res = await storage.update(pid, {"graph": body.model_dump(), "updatedAt": now_iso()})
    if not res:
        raise HTTPException(404, "Project not found")
    return {"saved": True, "updatedAt": res["updatedAt"]}


@api.post("/projects/seed-samples", status_code=200)
async def seed_samples():
    result = await seed_sample_projects(storage, only_if_empty=False)
    return {
        "inserted": result["inserted"],
        "skipped": result["skipped"],
        "insertedCount": len(result["inserted"]),
        "sampleIds": sorted(SAMPLE_IDS),
    }


@api.post("/projects/import", status_code=201)
async def import_project(body: ProjectImport):
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "description": body.description.strip(),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "graph": body.graph.model_dump(),
    }
    await storage.insert(doc)
    return doc


@api.post("/attachments", status_code=201)
async def upload_attachment(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_ATTACHMENT:
        raise HTTPException(413, "File too large (max 10 MB)")
    aid = str(uuid.uuid4())
    fname = file.filename or "file"
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "bin"
    ct = file.content_type or "application/octet-stream"
    if OBJSTORE_ENABLED:
        spath = f"workflow-studio/attachments/{aid}.{ext}"
        await asyncio.to_thread(objstore_put, spath, data, ct)
        backend_kind = "objstore"
    else:
        UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        spath = str(UPLOADS_DIR / f"{aid}.{ext}")
        Path(spath).write_bytes(data)
        backend_kind = "disk"
    rec = {"id": aid, "name": fname, "contentType": ct, "size": len(data),
           "storagePath": spath, "backend": backend_kind, "isDeleted": False, "createdAt": now_iso()}
    await storage.insert_file(rec)
    return {"id": aid, "name": fname, "contentType": ct, "size": len(data), "url": f"/api/attachments/{aid}"}


@api.get("/attachments/{aid}")
async def download_attachment(aid: str):
    rec = await storage.get_file(aid)
    if not rec:
        raise HTTPException(404, "Attachment not found")
    if rec["backend"] == "objstore":
        data, ct = await asyncio.to_thread(objstore_get, rec["storagePath"])
    else:
        p = Path(rec["storagePath"])
        if not p.exists():
            raise HTTPException(404, "Attachment file missing")
        data, ct = p.read_bytes(), rec["contentType"]
    safe_name = str(rec["name"]).replace('"', "")
    return Response(content=data, media_type=rec.get("contentType") or ct,
                    headers={"Content-Disposition": f'inline; filename="{safe_name}"'})


@api.delete("/attachments/{aid}")
async def delete_attachment(aid: str):
    rec = await storage.get_file(aid)
    if not rec:
        raise HTTPException(404, "Attachment not found")
    await storage.delete_file(aid)
    if rec["backend"] == "disk":
        Path(rec["storagePath"]).unlink(missing_ok=True)
    return {"deleted": True}


XAI_BASE = "https://api.x.ai/v1"
OPENAI_BASE = "https://api.openai.com/v1"
CURSOR_BASE = "https://api.cursor.com"
DEFAULT_GROK_MODEL = "grok-4.6"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_CURSOR_MODEL = "grok-4.6"


def detect_ai_kind(provider: str | None, base_url: str, api_key: str) -> str:
    p = (provider or "auto").strip().lower()
    key = (api_key or "").strip()
    url = (base_url or "").lower()
    if p in {"cursor", "crsr"} or key.startswith("crsr_"):
        return "cursor"
    if p in {"grok", "xai", "x.ai"}:
        return "xai"
    if p == "openai":
        return "openai"
    if p == "custom":
        return "custom"
    if key.startswith("xai-") or "x.ai" in url:
        return "xai"
    if key.startswith("sk-"):
        return "openai"
    if "grok" in url:
        return "xai"
    if url.strip():
        return "custom"
    return "xai"


def _normalize_openai_base(url: str, kind: str) -> str:
    u = url.strip().rstrip("/")
    for suffix in ("/chat/completions", "/responses", "/models"):
        if u.endswith(suffix):
            u = u[: -len(suffix)].rstrip("/")
    if kind == "xai" and "x.ai" in u.lower():
        path = u.split("x.ai", 1)[-1]
        if "/v1" not in path:
            u = u + "/v1"
    return u


def resolve_ai_config(base_url: str | None, api_key: str | None, model: str | None, provider: str | None):
    key = (api_key or "").strip()
    if not key:
        raise HTTPException(400, "API key is required")
    kind = detect_ai_kind(provider, base_url or "", key)
    url = (base_url or "").strip()
    if not url:
        url = {"xai": XAI_BASE, "cursor": CURSOR_BASE}.get(kind, OPENAI_BASE)
    url = _normalize_openai_base(url, kind)
    mdl = (model or "").strip() or (
        DEFAULT_GROK_MODEL if kind in {"xai", "cursor"} else DEFAULT_OPENAI_MODEL
    )
    return url, key, mdl, kind


def cursor_request(method: str, path: str, api_key: str, json: dict | None = None, timeout: int = 45):
    url = f"{CURSOR_BASE}{path}"
    last = None
    attempts = [
        {"auth": (api_key, "")},
        {"headers": {"Authorization": f"Bearer {api_key}"}},
    ]
    for extra in attempts:
        headers = {"Accept": "application/json"}
        if json is not None:
            headers["Content-Type"] = "application/json"
        headers.update(extra.get("headers") or {})
        last = requests.request(
            method, url, json=json, timeout=timeout,
            auth=extra.get("auth"), headers=headers,
        )
        if last.ok or last.status_code not in (401, 403, 405):
            return last
    return last


def cursor_model_ids(api_key: str) -> list[str]:
    r = cursor_request("GET", "/v1/models", api_key, timeout=30)
    if not r or not r.ok:
        return []
    data = r.json() if r.content else {}
    items = data.get("items") or data.get("data") or []
    ids = []
    for item in items:
        if isinstance(item, dict) and item.get("id"):
            ids.append(str(item["id"]))
        elif isinstance(item, str):
            ids.append(item)
    return ids


def pick_cursor_model(api_key: str, requested: str | None) -> str:
    if requested and requested.strip():
        return requested.strip()
    ids = cursor_model_ids(api_key)
    for candidate in (DEFAULT_CURSOR_MODEL, "composer-2.5", "composer-2", "auto"):
        if candidate in ids:
            return candidate
    return ids[0] if ids else DEFAULT_CURSOR_MODEL


def test_cursor_key(api_key: str) -> dict:
    me = cursor_request("GET", "/v1/me", api_key, timeout=25)
    models = cursor_request("GET", "/v1/models", api_key, timeout=25)
    if (not me or not me.ok) and (not models or not models.ok):
        err = me or models
        status = err.status_code if err is not None else 502
        if status in (401, 403):
            raise HTTPException(401, f"Invalid Cursor API key: {_api_error_message(err)}")
        raise HTTPException(502, f"Cursor API error ({status}): {_api_error_message(err) if err else 'no response'}")
    who = "Cursor account"
    if me is not None and me.ok:
        data = me.json() if me.content else {}
        who = data.get("userEmail") or data.get("apiKeyName") or data.get("userId") or who
    ids = []
    if models is not None and models.ok:
        payload = models.json() if models.content else {}
        items = payload.get("items") or payload.get("data") or []
        ids = [str(i.get("id")) for i in items if isinstance(i, dict) and i.get("id")]
    return {
        "ok": True,
        "provider": "Cursor",
        "base_url": CURSOR_BASE,
        "model": ids[0] if ids else DEFAULT_CURSOR_MODEL,
        "models": ids[:16],
        "message": f"Connected to Cursor as {who}" + (f" ({len(ids)} models)" if ids else ""),
    }


def cursor_complete_sdk(api_key: str, prompt: str, model: str, system: str = AI_SYSTEM) -> str:
    try:
        from cursor_sdk import Agent, AgentOptions, LocalAgentOptions
    except ImportError:
        raise HTTPException(
            503,
            "This Cursor key cannot call a chat-completions URL. Install the Cursor SDK next to the server: pip install cursor-sdk",
        )
    import tempfile
    msg = f"{system}\n\nUser request:\n{prompt}\n\nReply with only the required output. Do not create or edit files."
    with tempfile.TemporaryDirectory(prefix="ws-cursor-") as td:
        (Path(td) / "README.md").write_text("scratch workspace for AI Draft\n", encoding="utf-8")
        result = Agent.prompt(
            msg,
            AgentOptions(
                api_key=api_key,
                model=model or DEFAULT_CURSOR_MODEL,
                local=LocalAgentOptions(cwd=td),
            ),
        )
    text = getattr(result, "result", None) or ""
    status = getattr(result, "status", None)
    if not str(text).strip():
        raise HTTPException(502, f"Cursor agent returned no text (status={status})")
    return str(text)


def cursor_complete(api_key: str, prompt: str, model: str | None, system: str = AI_SYSTEM) -> str:
    mdl = pick_cursor_model(api_key, model)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ]
    r = cursor_request(
        "POST", "/v1/chat/completions", api_key,
        json={"model": mdl, "messages": messages},
        timeout=120,
    )
    if r is not None and r.ok:
        try:
            return r.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError):
            pass
    if r is not None and r.status_code in (401, 403):
        raise HTTPException(401, f"Invalid Cursor API key: {_api_error_message(r)}")
    r2 = cursor_request(
        "POST", "/v1/responses", api_key,
        json={"model": mdl, "input": messages},
        timeout=120,
    )
    if r2 is not None and r2.ok:
        text = _extract_responses_text(r2.json() if r2.content else {})
        if text:
            return text
    return cursor_complete_sdk(api_key, prompt, mdl, system=system)


def _api_error_message(resp: requests.Response) -> str:
    try:
        data = resp.json()
        err = data.get("error")
        if isinstance(err, dict):
            return str(err.get("message") or err.get("type") or data)[:400]
        if isinstance(err, str) and err:
            return err[:400]
        if data.get("message"):
            return str(data["message"])[:400]
    except Exception:
        pass
    text = (resp.text or "").strip()
    return (text or f"HTTP {resp.status_code}")[:400]


def _extract_responses_text(data: dict) -> str:
    text = data.get("output_text")
    if isinstance(text, str) and text.strip():
        return text
    parts: list[str] = []
    for item in data.get("output") or []:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if isinstance(content, str) and content:
            parts.append(content)
            continue
        for block in content or []:
            if isinstance(block, dict) and block.get("text"):
                parts.append(str(block["text"]))
        if item.get("text"):
            parts.append(str(item["text"]))
    return "\n".join(parts).strip()


def openai_chat(base: str, api_key: str, model: str, messages: list[dict], *, xai: bool) -> str:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if xai:
        resp = requests.post(
            f"{base}/responses",
            headers=headers,
            json={"model": model, "input": messages},
            timeout=120,
        )
        if resp.status_code in (401, 403):
            raise HTTPException(401, f"Invalid API key: {_api_error_message(resp)}")
        if resp.ok:
            text = _extract_responses_text(resp.json() if resp.content else {})
            if text:
                return text
        if resp.status_code not in (404, 405):
            raise HTTPException(502, f"AI API error ({resp.status_code}): {_api_error_message(resp)}")
    payload: dict[str, Any] = {"model": model, "messages": messages}
    if not xai:
        payload["temperature"] = 0.4
    resp = requests.post(f"{base}/chat/completions", headers=headers, json=payload, timeout=120)
    if resp.status_code in (401, 403):
        raise HTTPException(401, f"Invalid API key: {_api_error_message(resp)}")
    if not resp.ok:
        raise HTTPException(502, f"AI API error ({resp.status_code}): {_api_error_message(resp)}")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise HTTPException(502, f"Unexpected AI response: {e}")


def draft_with_openai_compatible(base_url: str, api_key: str, prompt: str, model: str | None = None, provider: str | None = None) -> dict:
    base, key, mdl, kind = resolve_ai_config(base_url, api_key, model, provider)
    if kind == "cursor":
        content = cursor_complete(key, prompt, mdl, system=AI_SYSTEM)
    else:
        content = openai_chat(
            base, key, mdl,
            [{"role": "system", "content": AI_SYSTEM}, {"role": "user", "content": prompt}],
            xai=(kind == "xai"),
        )
    return parse_ai_graph(content)


def test_ai_connection(base_url: str | None, api_key: str, model: str | None, provider: str | None) -> dict:
    key = (api_key or "").strip()
    if not key:
        raise HTTPException(400, "API key is required")
    if detect_ai_kind(provider, base_url or "", key) == "cursor":
        return test_cursor_key(key)
    base, key, mdl, kind = resolve_ai_config(base_url, api_key, model, provider)
    listed: list[str] = []
    if kind != "xai":
        r = requests.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=25)
        if r.status_code in (401, 403):
            raise HTTPException(401, f"Invalid API key: {_api_error_message(r)}")
        if r.ok:
            data = r.json() if r.content else {}
            listed = [m.get("id") for m in (data.get("data") or []) if isinstance(m, dict) and m.get("id")]
            return {
                "ok": True,
                "provider": "OpenAI-compatible",
                "base_url": base,
                "model": mdl,
                "models": listed[:16],
                "message": f"Connected to {base}" + (f" ({len(listed)} models)" if listed else ""),
            }
    openai_chat(base, key, mdl, [{"role": "user", "content": "Reply with the single word ok."}], xai=(kind == "xai"))
    return {
        "ok": True,
        "provider": "xAI Grok" if kind == "xai" else "OpenAI-compatible",
        "base_url": base,
        "model": mdl,
        "models": listed,
        "message": f"Connected to {base} using {mdl}",
    }


@api.post("/ai/test")
async def ai_test(body: AiTestRequest):
    try:
        return await asyncio.to_thread(
            test_ai_connection, body.base_url, body.api_key, body.model, body.provider
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("AI connection test failed: %s", e)
        raise HTTPException(502, f"Connection test failed: {e}")


@api.post("/ai/draft")
async def ai_draft(body: DraftRequest):
    # User-configured key (Grok / OpenAI / custom) takes precedence.
    if body.api_key:
        try:
            graph = await asyncio.to_thread(
                draft_with_openai_compatible,
                body.base_url, body.api_key, body.prompt, body.model, body.provider,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error("AI draft (custom endpoint) failed: %s", e)
            raise HTTPException(502, f"AI generation failed: {e}")
        if not graph["nodes"]:
            raise HTTPException(422, "AI could not produce a valid workflow from that description")
        return graph

    if not EMERGENT_KEY:
        raise HTTPException(503, "AI drafting is not configured (set an API key in Settings, or EMERGENT_LLM_KEY)")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError:
        raise HTTPException(503, "AI drafting requires the emergentintegrations package")
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=f"draft-{uuid.uuid4()}",
        system_message=AI_SYSTEM,
    ).with_model("openai", "gpt-5.4")
    try:
        resp = await chat.send_message(UserMessage(text=body.prompt))
    except Exception as e:
        logger.error("AI draft failed: %s", e)
        raise HTTPException(502, "AI generation failed, please try again")
    graph = parse_ai_graph(str(resp))
    if not graph["nodes"]:
        raise HTTPException(422, "AI could not produce a valid workflow from that description")
    return graph


app.include_router(api)


@app.on_event("startup")
async def startup_objstore():
    if OBJSTORE_ENABLED:
        try:
            await asyncio.to_thread(init_objstore)
            logger.info("Object storage initialized")
        except Exception as e:
            logger.error("Object storage init failed: %s", e)
    if STORAGE_KIND == "sqlite" and os.environ.get("WORKFLOW_SEED_SAMPLES", "1") != "0":
        try:
            result = await seed_sample_projects(storage, only_if_empty=True)
            if result["inserted"]:
                logger.info("Seeded %d sample workflow(s)", len(result["inserted"]))
        except Exception as e:
            logger.error("Sample workflow seed failed: %s", e)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_storage():
    storage.close()
