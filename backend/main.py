from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
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

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

INSTANCE_ID = os.getenv("INSTANCE_ID", "single")

app = FastAPI(
    title="TaskHub",
    version="1.0.0",
    root_path=os.getenv("ROOT_PATH", "")
)

async def check_due_dates_loop():
    """Background task to check for near-due todos every hour"""
    while True:
        try:
            db = next(database.get_db())
            try:
                # 3 days threshold (matching "urgency-high" frontend logic)
                threshold = datetime.now() + timedelta(days=3)
                
                # Find todos that:
                # 1. Are not done
                # 2. Have a due_date within 3 days (or overdue)
                # 3. Haven't had a reminder sent in the last 12 hours
                reminder_threshold = datetime.now() - timedelta(hours=12)
                
                near_due_todos = db.query(models.Todo).filter(
                    models.Todo.status != models.TodoStatus.DONE.value,
                    models.Todo.due_date <= threshold,
                    or_(
                        models.Todo.reminder_sent_at.is_(None),
                        models.Todo.reminder_sent_at <= reminder_threshold
                    )
                ).all()
                
                for todo in near_due_todos:
                    # Notify the assigned user (or the creator if unassigned)
                    user_to_notify_id = todo.assigned_to_user_id or todo.user_id
                    
                    user = db.query(models.User).filter(models.User.id == user_to_notify_id).first()
                    if user:
                        # Find the admin/creator name for the message
                        creator = db.query(models.User).filter(models.User.id == todo.user_id).first()
                        creator_name = creator.username if creator else "System"
                        
                        message = f"Reminder: Your todo '{todo.title}' is due soon!"
                        if todo.due_date < datetime.now():
                            message = f"Alert: Your todo '{todo.title}' is OVERDUE!"

                        await create_notification(
                            db,
                            user_to_notify_id,
                            todo.id,
                            message,
                            creator_name,
                            user.email,
                            todo.title
                        )
                        
                        # Update reminder timestamp
                        todo.reminder_sent_at = datetime.now()
                
                db.commit()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in check_due_dates_loop: {e}")
            
        # Run every 1 hour (3600 seconds)
        await asyncio.sleep(3600)

@app.on_event("startup")
async def startup_event():
    # Run database migrations
    try:
        run_all_migrations()
    except Exception as e:
        logger.error(f"Error during startup migrations: {e}")
        
    # Start the background task
    asyncio.create_task(check_due_dates_loop())

# CORS configuration based on environment
environment = os.getenv("ENVIRONMENT", "development").lower()

if environment == "production":
    # Production: Only allow Vercel production domain
    # You can add multiple production domains separated by commas in ALLOWED_ORIGINS
    allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
    if allowed_origins_env:
        # Split by comma and strip whitespace
        allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]
    else:
        # Default production origin
        allowed_origins = [
            "https://full-stack-todo-i0ggb4p23-hassanlasheenns-projects.vercel.app",
            "https://hassanlasheenn.github.io",
        ]
else:
    # Development: Only allow localhost
    allowed_origins = [
        "http://localhost",
        "http://localhost:4200",
        "http://localhost:4201",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
register_routers(app)


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