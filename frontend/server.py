"""Workflow Studio frontend server - FastAPI + Jinja2, zero npm."""
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE = Path(__file__).parent
app = FastAPI(title="Workflow Studio Frontend")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


@app.get("/{path:path}")
async def index(request: Request, path: str):
    return templates.TemplateResponse("index.html", {"request": request})
