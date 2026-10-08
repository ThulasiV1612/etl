"""Run the onboarding fields service (FastAPI + Flask mounted)."""

import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.fastapi_app:fastapi_app",
        host="0.0.0.0",
        port=settings.fastapi_port,
        reload=True,
    )
