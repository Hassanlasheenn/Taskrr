from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import register_routers
from app.cache import get_redis_status
import os

Base.metadata.create_all(bind=engine)

INSTANCE_ID = os.getenv("INSTANCE_ID", "single")

app = FastAPI(root_path=os.getenv("ROOT_PATH", ""))

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
            # Add your custom domain if you have one (e.g., "https://yourdomain.com")
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