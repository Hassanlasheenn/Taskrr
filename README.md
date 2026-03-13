# Taskrr Application

A full-stack Todo application with Angular 19, FastAPI, Redis, and SQL Server/Postgres.

## Project Architecture

This project uses a modern scalable architecture:

*   **Frontend:** Angular 19 SPA served via Nginx.
*   **Backend:** FastAPI (Python) scaled to 3 replicas.
*   **Load Balancer:** Nginx as a reverse proxy and load balancer.
*   **Cache:** Redis for high-performance data caching.
*   **Database:** SQL Server (local) or Postgres (Docker).

---

## Load Balancer (Nginx)

Nginx sits in front of the app and:

*   **Serves the frontend** — Static files from `frontend-dist` (Angular build).
*   **Load balances** — Uses an `upstream` with `least_conn` to spread traffic across 3 backend replicas; supports keepalive and failover.

The client talks only to Nginx. Nginx then routes to the appropriate backend instance.

---

## Cache (Redis)

Redis is used by the backend for caching:

*   **Endpoints cached** — e.g. mentionable users, user role, user by ID, admin user lists, todos list/detail/comments. Reduces database load for frequently read data.
*   **Invalidation** — Caches are cleared when data changes (create/update/delete).
*   **Optional** — If `REDIS_URL` is not set, the app runs without caching (no Redis required for basic runs).

In Docker, the backend gets `REDIS_URL=redis://redis:6379/0` from Compose. The `/health` endpoint reports Redis status (`ok` / `disabled` / `error`).

---

## How to Run (Cross-Platform)

Run from the **project root** (where `docker-compose.yml` lives). The script builds the frontend with the Docker config (same-origin API), copies it to `frontend-dist`, and starts the full stack (Nginx, backend replicas, Redis, and database if configured).

### Windows (PowerShell)

```powershell
.\scripts\serve-via-nginx.ps1
```

### macOS / Linux (Bash)

```bash
chmod +x scripts/serve-via-nginx.sh
./scripts/serve-via-nginx.sh
```
