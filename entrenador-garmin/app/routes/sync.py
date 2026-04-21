from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.services.sync_service import full_sync, sync_state

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/stream")
async def sync_stream():
    """SSE endpoint — streams real-time sync progress to the browser."""
    return StreamingResponse(
        full_sync(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/status")
def sync_status():
    return {
        "running": sync_state["running"],
        "last_sync": sync_state["last_sync"],
        "last_error": sync_state["last_error"],
    }
