# Full-Stack Todo App

## Stack
- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + Redis (caching) + S3 (storage)
- **Frontend**: Angular (standalone components, SSR-aware)
- **Infra**: Docker Compose + Nginx

## Project Layout
```
backend/
  app/
    models.py          # SQLAlchemy models: User, Todo, Comment, Notification, Story
    schemas.py         # Pydantic schemas
    routers/           # todos.py, users.py, admin.py, notifications.py
    services/          # email_service.py, notification_service.py, storage_service.py, rate_limiter.py
    cache.py           # Redis helpers + cache key prefixes
    config.py          # Env-based settings (CACHE_TTL_*, etc.)
    dependencies.py    # get_current_user, DB session
    time_utils.py      # sum_time_strings for HH:MM:SS accumulation
frontend/src/app/
  auth/                # login, register, forgot/reset password, verify email
  layouts/             # dashboard, profile, admin
  shared/              # reusable components
  core/                # interceptors, services
```

## Key Domain Rules
- **Todo statuses**: `new | inProgress | paused | done`
- **Priority levels**: `low | medium | high`
- **User roles**: `user | admin`
- **Todo types**: `workitem | story`
- Soft-delete via `is_deleted` flag — never hard-delete todos
- Time tracking stored as `HH:MM:SS` strings; use `sum_time_strings()` to accumulate
- `order_index` controls display order within lists

## Caching (Redis)
- Cache keys: `PREFIX_TODOS_LIST`, `PREFIX_TODO_DETAIL`, `PREFIX_TODO_COMMENTS`
- TTLs from `config.py`: `CACHE_TTL_TODO_LIST`, `CACHE_TTL_TODO_DETAIL`, `CACHE_TTL_TODO_COMMENTS`
- Always call appropriate `invalidate_*` helpers after mutations

## Auth
- Admin key for initial admin promotion: `generate_admin_key.py`

## What to avoid
- Do not hard-delete todos; set `is_deleted = True`
- Do not skip cache invalidation after writes
- Do not bypass `RateLimiter` on mutation endpoints
- Do not add migration logic inside routers (runtime schema checks exist for legacy; new columns go in `migrations/`)
