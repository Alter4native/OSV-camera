# OSV-PC — People counting

Алгоритм работы системы: [docs/system-algorithm.md](docs/system-algorithm.md)

Production-oriented MVP for person-only camera intelligence:

```text
Camera -> Video Ingestion -> YOLO Person Detector -> Tracker -> Face Recognition -> Events -> Backend API -> Database -> Dashboard
```

## Current Stage

- Stage 0: requirements clarified.
- Stage 1: architecture documented.
- Stage 2: project scaffold, health endpoints, Docker baseline.
- Stage 3: video ingestion interfaces, webcam/RTSP sources, FPS sampler, reconnect status manager.
- Stage 4: person-only YOLO detector contract, schemas, lazy YOLO adapter, mock detector tests.
- Stage 5: ByteTrack-style tracker contract, per-camera state, stable track IDs.
- Stage 6: event engine, cooldown/dedup, restricted zones, camera offline, people count, snapshot hooks.
- Stage 7: backend API surface, JWT auth, RBAC, internal event ingestion, in-memory MVP store.
- Stage 8: SQLAlchemy schema, Alembic initial migration, DB repository/seed skeleton.
- Stage 9: face recognition contracts, deterministic embedding recognizer, known/unknown matching, embedding metadata API.
- Stage 10: Qdrant-backed embedding store, vector status endpoints, person embedding delete flow.
- Stage 11: React dashboard with auth, RBAC-aware navigation, cameras, events, people, settings, vector status.

## MVP Defaults

- One camera.
- Local hardware first.
- Person-only detection.
- Events: `person_detected`, `known_person_detected`, `unknown_person_detected`, `restricted_zone_entry`, `camera_offline`, `people_count`.
- Event and snapshot retention: 30 days.
- PostgreSQL, Redis, Qdrant.
- Docker Compose deployment.

## Local Checks

Backend:

```powershell
cd .\backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -r .\requirements.txt
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m uvicorn src.main:app --reload --port 8000
```

Dev users:

```text
admin / admin
operator / operator
viewer / viewer
```

These users are for local MVP development only. Stage 8 added PostgreSQL schema/migrations; API persistence will be switched from in-memory store to DB repositories in the next backend integration step.

Database migrations:

```powershell
cd .\backend
..\.venv\Scripts\alembic -c .\database\alembic.ini upgrade head
```

AI service:

```powershell
cd .\ai-service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r .\requirements.txt
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8010
```

AI service camera status:

```powershell
Invoke-RestMethod http://localhost:8010/ai/camera/status
Invoke-RestMethod http://localhost:8010/ai/detector/status
Invoke-RestMethod http://localhost:8010/ai/tracker/status
Invoke-RestMethod http://localhost:8010/ai/events/status
Invoke-RestMethod http://localhost:8010/ai/recognition/status
Invoke-RestMethod http://localhost:8010/ai/vector/status
```

Event payload note: `snapshot_url` is a private storage key in MVP, not a public URL.

Recognition note: the current `simple` recognizer is deterministic and test-friendly. It is not a production biometric model. Vector storage is pluggable via `EMBEDDING_STORE_RUNTIME=memory|qdrant`; Docker Compose defaults to Qdrant.

Frontend:

```powershell
cd .\frontend
npm install
npm run build
npm run dev
```

Vercel frontend deployment:

```text
Root Directory: frontend
Framework Preset: Vite
Install Command: npm ci
Build Command: npm run build
Output Directory: dist
```

Vercel proxies backend and AI service through `frontend/vercel.json`.
Set Vercel environment variables to relative paths:

```text
VITE_API_BASE_URL=/api
VITE_AI_BASE_URL=/ai
```

Current proxy destinations:

```text
/api -> https://eastern-dare-repeated-reach.trycloudflare.com/api
/ai  -> https://eastern-dare-repeated-reach.trycloudflare.com/ai
```

The same values are documented in `frontend/.env.vercel.example`.

Quick demo tunnel:

```powershell
.\scripts\start_demo_tunnel.ps1 -Push
```

This starts a temporary Cloudflare Tunnel for local Docker nginx on `http://127.0.0.1:8081`,
updates `frontend/vercel.json`, commits and pushes the new tunnel URL so Vercel can redeploy.
Keep the `cloudflared` process running during the demo.

Dashboard capabilities:

- Login via backend JWT (`admin/admin`, `operator/operator`, `viewer/viewer` for local MVP).
- Viewer sees read-only cameras/events/models/settings and no people management.
- Admin/operator can add/update cameras, manage known people, upload photos, register embedding metadata and edit thresholds.
- Event filters run client-side form state plus authorized API requests.
- Snapshot view resolves through authorized backend metadata, not a public static file URL.

Docker Compose:

```powershell
docker compose -f .\infra\docker-compose.yml config
docker compose -f .\infra\docker-compose.yml up --build
```

NVIDIA GPU deployment:

```powershell
docker compose -f .\infra\docker-compose.yml -f .\infra\docker-compose.gpu.yml build ai-service
docker compose -f .\infra\docker-compose.yml -f .\infra\docker-compose.gpu.yml up -d
```

The GPU host must have a compatible NVIDIA driver, Docker Engine and NVIDIA Container Toolkit. The GPU override switches the AI image to CUDA-enabled PyTorch and reserves one NVIDIA GPU for `ai-service`; on CPU-only machines use the regular Compose command above.

## Camera Credentials

Do not commit camera credentials. Put RTSP access only into a local `.env` file:

```powershell
CAMERA_SOURCE_TYPE=rtsp
CAMERA_SOURCE_URI=rtsp://username:password@camera-ip:554/path
```

The exact RTSP path depends on the camera vendor/model.

## URLs

- Frontend via Compose nginx: `http://localhost:8081`
- Backend health: `http://localhost:8000/api/health`
- AI service health: `http://localhost:8010/ai/health`
- AI service camera status: `http://localhost:8010/ai/camera/status`
- AI service detector status: `http://localhost:8010/ai/detector/status`
- AI service tracker status: `http://localhost:8010/ai/tracker/status`
- AI service events status: `http://localhost:8010/ai/events/status`
- AI service recognition status: `http://localhost:8010/ai/recognition/status`
- AI service vector status: `http://localhost:8010/ai/vector/status`
- Frontend dev server: `http://localhost:5173`
