"""Workflow Studio frontend server - FastAPI + Jinja2, zero npm."""
import asyncio
import os
from pathlib import Path

import requests
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE = Path(__file__).parent
app = FastAPI(title="Workflow Studio Frontend")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


def _backend_origin() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("BACKEND_URL", "")
    if not url:
        env_path = BASE / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip()
                    break
    url = (url or "http://127.0.0.1:8001").rstrip("/")
    if url.endswith("/api"):
        url = url[:-4]
    return url


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
async def proxy_api(path: str, request: Request):
    url = f"{_backend_origin()}/api/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length", "connection")
    }
    body = await request.body()

    def _do():
        return requests.request(request.method, url, data=body or None, headers=headers, timeout=180)

    r = await asyncio.to_thread(_do)
    skip = {"content-encoding", "transfer-encoding", "connection"}
    out = {k: v for k, v in r.headers.items() if k.lower() not in skip}
    return Response(content=r.content, status_code=r.status_code, headers=out)


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/{path:path}")
async def spa(request: Request, path: str):
    if path == "api" or path.startswith("api/"):
        return Response(status_code=404, content="Not Found")
    return templates.TemplateResponse(request, "index.html")
