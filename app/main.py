import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.database import Base, engine
from app.routes.activities import router as activities_router
from app.services.sync_service import sync_service

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initialising database...")
    Base.metadata.create_all(bind=engine)
    logger.info("Starting background sync scheduler...")
    sync_service.start()
    yield
    logger.info("Shutting down sync scheduler...")
    sync_service.stop()


app = FastAPI(
    title="Garmin Sync API",
    description=(
        "Syncs Garmin Connect activities to a local SQLite database "
        "and exposes a REST API to query them."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(activities_router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
