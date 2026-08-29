"""Workflow Studio backend – shared workspace surrogate for the web preview.

Provides project persistence so the same UI can target either IndexedDB
(personal workspace) or a remote database (shared workspace / future SQL Server).
"""
from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, List, Optional
from pydantic import BaseModel, Field, ConfigDict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Workflow Studio API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("workflow-studio")


# ---------- Models ----------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProjectSummary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str = ""
    version: int = 1
    createdAt: str
    updatedAt: str
    storageType: str = "remote"
    nodeCount: int = 0


class ProjectPayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: Optional[str] = None
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    version: int = 1
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    storageType: str = "remote"
    metadata: dict = Field(default_factory=dict)
    nodes: List[dict] = Field(default_factory=list)
    connections: List[dict] = Field(default_factory=list)


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"service": "workflow-studio", "status": "ok"}


@api_router.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "db": "up"}
    except Exception as exc:  # pragma: no cover
        return {"status": "degraded", "error": str(exc)}


@api_router.get("/projects", response_model=List[ProjectSummary])
async def list_projects():
    cursor = db.workflow_projects.find(
        {},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "description": 1,
            "version": 1,
            "createdAt": 1,
            "updatedAt": 1,
            "storageType": 1,
            "nodes": 1,
        },
    ).sort("updatedAt", -1)
    items = []
    async for doc in cursor:
        items.append(
            ProjectSummary(
                id=doc["id"],
                name=doc.get("name", "Untitled"),
                description=doc.get("description", ""),
                version=doc.get("version", 1),
                createdAt=doc.get("createdAt", _now()),
                updatedAt=doc.get("updatedAt", _now()),
                storageType=doc.get("storageType", "remote"),
                nodeCount=len(doc.get("nodes", [])),
            )
        )
    return items


@api_router.get("/projects/{project_id}")
async def get_project(project_id: str) -> dict[str, Any]:
    doc = await db.workflow_projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc


@api_router.post("/projects")
async def create_project(payload: ProjectPayload):
    now = _now()
    project_id = payload.id or str(uuid.uuid4())
    doc = payload.model_dump()
    doc["id"] = project_id
    doc["createdAt"] = payload.createdAt or now
    doc["updatedAt"] = now
    doc["storageType"] = "remote"
    await db.workflow_projects.replace_one({"id": project_id}, doc, upsert=True)
    return doc


@api_router.put("/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectPayload):
    existing = await db.workflow_projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    doc = payload.model_dump()
    doc["id"] = project_id
    doc["createdAt"] = existing.get("createdAt", _now())
    doc["updatedAt"] = _now()
    doc["storageType"] = "remote"
    await db.workflow_projects.replace_one({"id": project_id}, doc)
    return doc


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    result = await db.workflow_projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"deleted": project_id}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
