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
VALID_NODE_TYPES = {"start", "end", "process", "decision", "database", "api", "document", "delay", "email", "subflow"}
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


@api.post("/ai/draft")
async def ai_draft(body: DraftRequest):
    if not EMERGENT_KEY:
        raise HTTPException(503, "AI drafting is not configured (missing EMERGENT_LLM_KEY)")
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
