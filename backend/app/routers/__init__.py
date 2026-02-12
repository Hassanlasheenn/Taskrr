from fastapi import FastAPI
from .users import router as users_router
from .todos import router as todos_router
from .admin import router as admin_router
from .notifications import router as notifications_router
from ..auth import router as auth_router


ROUTERS = [
    {"router": auth_router, "prefix": "", "tags": ["auth"]},
    {"router": users_router, "prefix": "/users", "tags": ["users"]},
    {"router": todos_router, "prefix": "", "tags": ["todos"]},
    {"router": admin_router, "prefix": "", "tags": ["admin"]},
    {"router": notifications_router, "prefix": "", "tags": ["notifications"]},
]


def register_routers(app: FastAPI) -> None:
    """Register all routers with the FastAPI application"""
    for route_config in ROUTERS:
        app.include_router(
            route_config["router"],
            prefix=route_config.get("prefix", ""),
            tags=route_config.get("tags", [])
        )

