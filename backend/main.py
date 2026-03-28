from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
from app.routers import register_routers
from app.cache import get_redis_status
import os
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app import models, database
from app.routers.notifications import create_notification
from run_migrations import run_all_migrations
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

INSTANCE_ID = os.getenv("INSTANCE_ID", "single")

app = FastAPI(
    title="Taskrr",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", "")
)

# Mount static files directory for uploads
static_dir = os.path.join(os.getcwd(), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)
    os.makedirs(os.path.join(static_dir, "profile_pics"), exist_ok=True)

app.mount("/static", StaticFiles(directory=static_dir), name="static")

async def _process_due_date_reminders():
    try:
        db = database.SessionLocal()
        try:
            now = datetime.now()
            # 3 days threshold (matching "urgency-high" frontend logic)
            threshold = now + timedelta(days=3)
            
            # Find todos that:
            # 1. Are not done
            # 2. Have a due_date within 3 days (or overdue)
            # 3. Haven't had a reminder sent in the last 24 hours
            reminder_threshold = now - timedelta(hours=24)
            
            near_due_todos = db.query(models.Todo).filter(
                models.Todo.status != models.TodoStatus.DONE.value,
                models.Todo.due_date <= threshold,
                or_(
                    models.Todo.reminder_sent_at.is_(None),
                    models.Todo.reminder_sent_at <= reminder_threshold
                )
            ).all()
            
            if not near_due_todos:
                return

            for todo in near_due_todos:
                # Determine who to notify
                user_to_notify_id = todo.assigned_to_user_id or todo.user_id
                target_user = db.query(models.User).filter(models.User.id == user_to_notify_id).first()
                
                if target_user:
                    due_date = todo.due_date
                    message = f"Urgent Reminder: '{todo.title}' is due soon!"
                    if due_date < now:
                        message = f"Alert: '{todo.title}' is already OVERDUE!"
                    
                    # Create notification via the unified utility
                    await create_notification(
                        db, user_to_notify_id, todo.id, message,
                        "System", target_user.email, todo.title
                    )
                    
                    # Update reminder timestamp to prevent spamming
                    todo.reminder_sent_at = now
            
            db.commit()
            logger.info(f"✅ Periodic check: Processed {len(near_due_todos)} due date reminders")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in _process_due_date_reminders: {e}")

async def check_due_dates_loop():
    await asyncio.sleep(60)
    while True:
        await _process_due_date_reminders()
        # Run every 1 hour (3600 seconds)
        await asyncio.sleep(3600)

@app.on_event("startup")
async def startup_event():
    # Run database initialization and migrations
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: Base.metadata.create_all(bind=engine))
        await loop.run_in_executor(None, run_all_migrations)
        logger.info("✅ Database initialization and migrations completed")
    except Exception as e:
        logger.error(f"Error during startup: {e}")
        
    # Start the periodic background task
    asyncio.create_task(check_due_dates_loop())

# CORS configuration
environment = os.getenv("ENVIRONMENT", "development").lower()
if environment == "production":
    allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
    if allowed_origins_env:
        allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]
    else:
        allowed_origins = ["https://taskrr.app", "https://www.taskrr.app"]
else:
    allowed_origins = ["http://localhost", "http://localhost:4200", "http://localhost:4201"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_routers(app)

@app.middleware("http")
async def log_request_time(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    logger.info(f"Method: {request.method} Path: {request.url.path} Process Time: {process_time:.4f}s")
    response.headers["X-Process-Time"] = str(process_time)
    return response

@app.middleware("http")
async def add_instance_header(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Served-By"] = INSTANCE_ID
    return response

@app.get("/health")
def health():
    redis_status = get_redis_status()
    return {
        "status": "ok",
        "instance": INSTANCE_ID,
        "redis": redis_status,
    }
