"""Workflow Studio API - fully Python backend (FastAPI).

Storage backends:
- mongo  : used in the cloud preview (MONGO_URL from .env)
- sqlite : used for local runs (python run_local.py) - zero external services
"""
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import json
import sqlite3
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, List, Optional
from pydantic import BaseModel, Field

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
    name: Optional[str] = None
    description: Optional[str] = None


class GraphPayload(BaseModel):
    nodes: List[dict] = []
    connections: List[dict] = []


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

    async def list(self) -> List[dict]:
        out = []
        async for doc in self.col.find().sort("updatedAt", -1):
            doc.pop("_id", None)
            out.append(doc)
        return out

    async def get(self, pid: str) -> Optional[dict]:
        doc = await self.col.find_one({"id": pid})
        if doc:
            doc.pop("_id", None)
        return doc

    async def insert(self, doc: dict) -> None:
        await self.col.insert_one({**doc, "_id": doc["id"]})

    async def update(self, pid: str, updates: dict) -> Optional[dict]:
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
        self.conn.commit()

    @staticmethod
    def _row_to_doc(row: sqlite3.Row) -> dict:
        d = dict(row)
        d["graph"] = json.loads(d.get("graph") or "{}")
        return d

    async def list(self) -> List[dict]:
        rows = self.conn.execute("SELECT * FROM projects ORDER BY updatedAt DESC").fetchall()
        return [self._row_to_doc(r) for r in rows]

    async def get(self, pid: str) -> Optional[dict]:
        row = self.conn.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
        return self._row_to_doc(row) if row else None

    async def insert(self, doc: dict) -> None:
        self.conn.execute(
            "INSERT INTO projects (id,name,description,createdAt,updatedAt,graph) VALUES (?,?,?,?,?,?)",
            (doc["id"], doc["name"], doc["description"], doc["createdAt"],
             doc["updatedAt"], json.dumps(doc["graph"])),
        )
        self.conn.commit()

    async def update(self, pid: str, updates: dict) -> Optional[dict]:
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


app.include_router(api)

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
