"""Run Workflow Studio locally with a single command.

    pip install fastapi "uvicorn[standard]" jinja2 python-dotenv
    python run_local.py

Serves UI + API together on http://localhost:8000 using a local SQLite
database (workflow_studio.db) - no MongoDB or Node.js required.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
os.environ["WORKFLOW_STORAGE"] = "sqlite"
os.environ.setdefault("WORKFLOW_DB_PATH", str(ROOT / "workflow_studio.db"))
sys.path.insert(0, str(ROOT / "backend"))

from server import app  # noqa: E402  (backend FastAPI app with /api routes)
from fastapi import Request  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from fastapi.templating import Jinja2Templates  # noqa: E402

app.mount("/static", StaticFiles(directory=ROOT / "frontend" / "static"), name="static")
templates = Jinja2Templates(directory=ROOT / "frontend" / "templates")


@app.get("/{path:path}", include_in_schema=False)
async def index(request: Request, path: str):
    return templates.TemplateResponse(request, "index.html")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    print(f"\n  Workflow Studio running at  http://localhost:{port}\n")
    uvicorn.run(app, host="127.0.0.1", port=port)
