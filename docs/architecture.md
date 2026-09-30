оооооооо+# OSV-PC - People counting Architecture

## 1. Scope MVP

MVP строится для одной камеры на локальном железе. Система сразу включает video ingestion, YOLO person detection, tracking, face recognition, event engine, backend API, database, vector database и dashboard.

Важное ограничение MVP: система детектит только людей. Предметы и generic object detection не входят в первую версию. Событие `object_detected` исключено из обязательного MVP scope.

## 2. Целевой pipeline

```text
RTSP / USB Webcam
  -> ai-service: Video Ingestion
  -> ai-service: Frame Sampler
  -> ai-service: YOLO Person Detector
  -> ai-service: ByteTrack Tracker
  -> ai-service: Face Recognition
  -> ai-service: Event Engine
  -> backend: Internal Events API
  -> PostgreSQL / Qdrant / Snapshot Storage
  -> frontend Dashboard
```

## 3. Сервисы

### ai-service

Ответственность:
- подключение к RTSP/USB камере;
- reconnect при обрыве;
- контроль processing FPS;
- YOLO inference только по классу `person`;
- tracking людей через ByteTrack;
- face detection/embedding/matching;
- создание событий по правилам;
- сохранение snapshot в private storage;
- отправка событий в backend internal API;
- метрики FPS, inference latency, recognition latency, camera status.

Не отвечает за:
- публичную авторизацию пользователей;
- хранение бизнес-данных как источник истины;
- раздачу snapshots напрямую пользователям.

### backend

Ответственность:
- публичный REST API;
- JWT auth и RBAC;
- CRUD камер, людей, моделей, настроек;
- хранение событий;
- прием событий от ai-service через protected internal API;
- выдача snapshots только после проверки прав;
- audit logging;
- retention policy на 30 дней;
- API для dashboard.

### frontend

Ответственность:
- login/logout;
- список камер и статус;
- события с фильтрами по камере, дате, типу;
- просмотр snapshot через backend API;
- управление известными людьми;
- загрузка фото для enrollment;
- настройки thresholds и restricted zone.

### PostgreSQL

Источник истины для:
- users/roles;
- cameras/settings;
- events/event metadata;
- persons/person photos metadata;
- model registry;
- audit logs;
- retention jobs.

### Redis

Используется для:
- rate limit;
- short-lived cache;
- опционально очереди ai-service -> backend, если internal HTTP станет узким местом;
- distributed locks для retention jobs.

### Qdrant

Vector database для face embeddings.

Collection MVP:
- `person_face_embeddings`
- vector size зависит от выбранной embedding model;
- distance: cosine;
- payload: `person_id`, `photo_id`, `embedding_model`, `created_at`.

### Snapshot storage

MVP:
- локальный private volume `storage/snapshots`;
- прямой публичный доступ запрещен;
- frontend получает snapshot только через backend endpoint.

Следующий шаг:
- MinIO/S3-compatible storage.

## 4. Runtime defaults

- Детектор: Ultralytics YOLO, baseline `yolov8n`/`yolo11n` class `person`.
- Tracker: ByteTrack.
- Recognition: face detector + face embedding model; конкретная библиотека фиксируется на этапе 9 после проверки совместимости.
- Inference runtime MVP: PyTorch или ONNX Runtime CPU.
- Optimization later: TensorRT для NVIDIA, OpenVINO для Intel.

## 5. Data flow событий

1. Camera reader получает кадр.
2. Frame sampler пропускает кадры по `processing_fps`.
3. YOLO detector возвращает только detections класса `person`.
4. Tracker назначает `track_id`.
5. Recognition пытается распознать лицо внутри person crop.
6. Event engine применяет правила:
   - cooldown;
   - dedup по `camera_id + track_id + event_type`;
   - restricted zone polygon;
   - thresholds.
7. Snapshot сохраняется в private storage.
8. Event отправляется в backend internal API.
9. Backend валидирует service token и сохраняет событие.
10. Dashboard читает события через публичный API.

## 6. Event types MVP

### `person_detected`

Создается при первом появлении нового tracked человека после cooldown.

Metadata:
- `track_id`
- `bbox`
- `confidence`
- `camera_id`

### `known_person_detected`

Создается, если face embedding совпал с известным человеком выше threshold.

Metadata:
- `track_id`
- `person_id`
- `recognition_score`
- `bbox`
- `face_bbox`

### `unknown_person_detected`

Создается, если лицо найдено, но совпадение ниже threshold.

Metadata:
- `track_id`
- `recognition_score`
- `bbox`
- `face_bbox`

### `restricted_zone_entry`

Создается, если tracked человек пересек или находится внутри polygon зоны.

Metadata:
- `track_id`
- `zone_id`
- `zone_name`
- `bbox`
- `centroid`

### `camera_offline`

Создается при потере потока после reconnect timeout.

Metadata:
- `last_frame_at`
- `error`
- `retry_count`

### `people_count`

Агрегированная метрика/событие по количеству людей на камере. Не создается на каждый кадр.

Metadata:
- `count`
- `track_ids`
- `window_started_at`
- `window_ended_at`

## 7. Dedup и cooldown

MVP defaults:
- `person_detected`: один раз на track, cooldown 60 секунд.
- `known_person_detected`: один раз на `track_id + person_id`, cooldown 120 секунд.
- `unknown_person_detected`: один раз на track, cooldown 120 секунд.
- `restricted_zone_entry`: один раз при входе в зону, repeat cooldown 300 секунд.
- `camera_offline`: один раз на offline episode.
- `people_count`: агрегировать каждые 5-10 секунд или писать только при изменении count.

## 8. Backend API boundaries

Public API:
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/me`
- `GET /api/cameras`
- `POST /api/cameras`
- `PATCH /api/cameras/{camera_id}`
- `GET /api/events`
- `GET /api/events/{event_id}`
- `GET /api/events/{event_id}/snapshot`
- `GET /api/persons`
- `POST /api/persons`
- `POST /api/persons/{person_id}/photos`
- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/models`

Internal API:
- `POST /internal/events`
- `PATCH /internal/cameras/{camera_id}/status`
- `POST /internal/embeddings/search` optional, если matching делается через backend.

Public API защищен JWT. Internal API защищен service token.

## 9. RBAC

`admin`:
- полный доступ;
- управление пользователями, камерами, людьми, настройками, retention.

`operator`:
- просмотр камер/событий;
- управление людьми и фото;
- изменение thresholds и restricted zone, если разрешено политикой.

`viewer`:
- только чтение камер, событий и snapshots;
- без доступа к управлению людьми и настройками.

## 10. Database model overview

Основные таблицы:
- `users`
- `roles`
- `user_roles`
- `cameras`
- `camera_settings`
- `restricted_zones`
- `events`
- `event_snapshots`
- `persons`
- `person_photos`
- `recognition_profiles`
- `model_versions`
- `settings`
- `audit_logs`
- `retention_jobs`

Ключевые индексы:
- `events(camera_id, created_at)`
- `events(event_type, created_at)`
- `events(camera_id, event_type, created_at)`
- `persons(display_name)`
- `audit_logs(user_id, created_at)`

## 11. Snapshot access

Snapshot сохраняется как private file:

```text
storage/snapshots/{camera_id}/{yyyy}/{mm}/{dd}/{event_id}.jpg
```

В БД хранится storage key, а не публичная ссылка.

Frontend запрашивает:

```text
GET /api/events/{event_id}/snapshot
```

Backend:
- проверяет JWT;
- проверяет RBAC;
- проверяет существование события;
- возвращает файл или short-lived signed URL только для S3-compatible storage.

## 12. Settings MVP

Глобальные настройки:
- `processing_fps`
- `person_confidence_threshold`
- `face_recognition_threshold`
- `event_cooldown_seconds`
- `camera_offline_timeout_seconds`
- `retention_days = 30`

Настройки камеры:
- `source_type`: `rtsp` или `webcam`
- `source_uri`
- `enabled`
- `processing_fps`
- `restricted_zones`

## 13. Deployment MVP

Сервисы Docker Compose:
- `ai-service`
- `backend`
- `frontend`
- `postgres`
- `redis`
- `qdrant`
- `nginx`

Локальный запуск:
- backend API через nginx: `http://localhost/api`
- ai-service internal health: `http://localhost/ai/health`
- frontend: `http://localhost`

## 14. Monitoring

AI metrics:
- camera online/offline;
- frames read;
- processing FPS;
- detector latency p50/p95;
- tracker latency;
- recognition latency;
- events emitted.

Backend metrics:
- request latency;
- error rate;
- auth failures;
- event insert rate;
- snapshot access count;
- retention deleted count.

## 15. Architecture decisions

1. Backend является источником истины для бизнес-данных.
2. AI service не раздает пользовательские файлы напрямую.
3. В MVP детектируются только люди.
4. Embeddings хранятся в Qdrant, metadata - в PostgreSQL.
5. Snapshot storage закрыт от публичного доступа.
6. События защищены от дублей через `track_id`, cooldown и event state.
7. Docker Compose является целевым deployment для MVP.

## 16. Этап 1 - результат

Архитектура готова для перехода к этапу 2: подготовка окружения и создание структуры проекта.

Оставшиеся решения для этапа 2:
- выбрать стартовый тип камеры по умолчанию: `webcam` как local default;
- restricted zone в MVP хранить в backend settings и редактировать через dashboard позже;
- выбрать конкретный face recognition backend на этапе 9 после проверки зависимостей.

## 17. Этап 3 - video ingestion implementation

Реализовано:
- `CameraSource` abstraction;
- OpenCV-backed `WebcamCameraSource`;
- OpenCV-backed `RTSPCameraSource`;
- `MockCameraSource` для тестов без физической камеры;
- `FrameSampler` для ограничения `processing_fps`;
- `CameraManager` с open/read/close lifecycle;
- reconnect backoff при ошибке открытия или чтения;
- `CameraStatus` со state, last frame timestamp, last error, frame count и reconnect attempts;
- endpoint `GET /ai/camera/status`.

Ограничения этапа:
- реальная камера не открывается автоматически при старте сервиса;
- runtime loop обработки кадров будет подключен после detector/tracker pipeline;
- тесты не зависят от USB/RTSP железа.

## 18. Этап 4 - person detection implementation

Реализовано:
- `ObjectDetector` abstraction;
- `Detection` и `BoundingBox` schemas;
- `YoloDetector` adapter;
- lazy loading `ultralytics.YOLO` на первом inference;
- фильтрация строго по классу `person`;
- confidence threshold;
- `MockPersonDetector` для unit tests;
- detector factory;
- endpoint `GET /ai/detector/status`.

Detection contract:
- `camera_id`
- `frame_sequence`
- `timestamp`
- `bbox` в `xyxy`
- `class_id`
- `class_name`
- `confidence`

Ограничения этапа:
- если локальный `.pt` файл отсутствует, YOLO adapter использует pretrained `yolov8n.pt`;
- detector еще не подключен к постоянному camera processing loop;
- generic object detection намеренно не реализован.

## 19. Этап 5 - tracking implementation

Реализовано:
- `ObjectTracker` abstraction;
- `TrackedObject` и `TrackerMetadata` schemas;
- `ByteTrackTracker` с dependency-light ByteTrack-style IoU association;
- per-camera track state;
- стабильный `track_id` для перекрывающихся bbox между кадрами;
- TTL для удаления stale tracks;
- фильтрация только `person` detections;
- endpoint `GET /ai/tracker/status`.

Tracking contract:
- вход: `camera_id`, `frame_sequence`, `detections`;
- выход: `TrackedObject[]`;
- dedup key для следующего этапа: `camera_id + track_id + event_type`.

Ограничения этапа:
- tracker еще не подключен к continuous processing loop;
- re-identification после долгой потери track не решается на этом этапе;
- оптимизированный backend ByteTrack можно заменить позже без изменения public contract.

## 20. Этап 6 - events implementation

Реализовано:
- `EventType` enum;
- `VisionEvent` schema;
- `RecognitionResult` placeholder contract для будущего face recognition этапа;
- `RestrictedZone` и polygon geometry;
- `EventEngine` с cooldown/dedup state;
- `person_detected`;
- `known_person_detected`;
- `unknown_person_detected`;
- `restricted_zone_entry`;
- `camera_offline`;
- `people_count`;
- `SnapshotStore` interface;
- `LocalSnapshotStore`;
- `NoopSnapshotStore`;
- `EventPublisher` interface;
- `InMemoryEventPublisher`;
- `HttpEventPublisher`;
- endpoint `GET /ai/events/status`.

Dedup/cooldown keys:
- `person_detected`: `camera_id + track_id`;
- `known_person_detected`: `camera_id + track_id + person_id`;
- `unknown_person_detected`: `camera_id + track_id`;
- `restricted_zone_entry`: `camera_id + track_id + zone_id`;
- `camera_offline`: один раз на offline episode;
- `people_count`: только при изменении count и не чаще configured interval.

Snapshot rule:
- `snapshot_url` в `VisionEvent` является private storage key, не публичным URL.
- Публичная выдача snapshots будет только через backend API после auth/RBAC.

Ограничения этапа:
- backend endpoint `/internal/events` еще не реализован;
- database persistence будет в этапах 7-8;
- recognition events используют готовый contract, но face recognition будет реализован на этапе 9.

## 21. Этап 7 - backend API implementation

Реализовано:
- JWT auth: `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/me`;
- RBAC roles: `admin`, `operator`, `viewer`;
- Cameras API: list/create/detail/update/status;
- Events API: list/detail/snapshot metadata;
- Persons API: list/create/detail/photo upload metadata;
- Models API: list model versions;
- Settings API: read/update thresholds and retention;
- Internal API: `POST /internal/events`;
- Internal API: `PATCH /internal/cameras/{camera_id}/status`;
- service token guard для `/internal/*`;
- in-memory `AppStore` как временный backend repository.

RBAC MVP:
- `admin`: all operations;
- `operator`: camera/settings/person write operations;
- `viewer`: read-only cameras/events/models/settings; no persons access.

Important boundary:
- Stage 7 intentionally does not implement PostgreSQL persistence.
- Stage 8 replaces `AppStore` with SQLAlchemy repositories and Alembic migrations.
- Snapshot endpoint returns private storage key metadata only; actual file streaming/auth policy is hardened in later stages.

## 22. Этап 8 - database schema implementation

Реализовано:
- SQLAlchemy `Base`;
- sync `SessionLocal` factory;
- Alembic config: `backend/database/alembic.ini`;
- Alembic env: `backend/database/migrations/env.py`;
- initial migration: `0001_initial_schema`;
- DB repository skeleton;
- DB seed skeleton для dev roles/users/camera/model/settings.

Таблицы:
- `roles`;
- `users`;
- `user_roles`;
- `cameras`;
- `camera_settings`;
- `restricted_zones`;
- `events`;
- `event_snapshots`;
- `persons`;
- `person_photos`;
- `recognition_profiles`;
- `model_versions`;
- `settings`;
- `audit_logs`;
- `retention_jobs`.

Ключевые индексы:
- `ix_events_camera_created`;
- `ix_events_type_created`;
- `ix_events_camera_type_created`;
- `ix_persons_display_name`;
- `ix_audit_logs_user_created`;
- `ix_model_versions_name_version`.

Команда миграции:

```powershell
cd .\backend
..\.venv\Scripts\alembic -c .\database\alembic.ini upgrade head
```

Important boundary:
- Stage 8 добавляет schema/repositories, но API routes пока остаются на `AppStore`, чтобы не требовать running PostgreSQL для local tests.
- Следующий backend integration step переключит routes на SQLAlchemy repositories через dependency injection.

## 23. Этап 9 - face recognition / embeddings implementation

Реализовано:
- `FaceRecognizer` abstraction;
- `EmbeddingStore` abstraction;
- `FaceEmbedding`, `PersonEmbedding`, `FaceRecognitionInput`, `FaceRecognitionOutput`;
- `SimpleFaceRecognizer` для deterministic local embeddings;
- cosine similarity matching;
- in-memory embedding store;
- known/unknown decision через threshold;
- conversion в event `RecognitionResult`;
- Person Re-ID future boundary: `PersonReIDRecognizer`;
- endpoint `GET /ai/recognition/status`;
- backend endpoint `POST /api/persons/{person_id}/embeddings` для регистрации embedding metadata.

Recognition behavior:
- если `face_bbox` отсутствует, face recognition не возвращает результат;
- если ближайший embedding >= threshold, результат `known`;
- если match ниже threshold или embeddings нет, результат `unknown`;
- embeddings не логируются и не возвращаются в API responses.

Important boundary:
- `SimpleFaceRecognizer` не является production biometric model.
- Stage 10 подключает Qdrant/vector DB.
- Production face model/runtime будет заменяемым через `FaceRecognizer` contract.

## 24. Этап 10 - vector database implementation

Реализовано:
- `QdrantEmbeddingStore` за интерфейсом `EmbeddingStore`;
- автоматическое создание Qdrant collection `person_face_embeddings`;
- cosine vector search через Qdrant;
- upsert embeddings с payload metadata: `person_id`, `photo_id`, `model_name`, `embedding_dim`, `created_at`;
- delete embeddings по `person_id`;
- AI endpoint `GET /ai/vector/status`;
- backend `EmbeddingVectorService`;
- backend endpoint `GET /api/persons/embeddings/status`;
- backend endpoint `DELETE /api/persons/{person_id}/embeddings`;
- local in-memory Qdrant tests без внешнего контейнера.

Runtime selection:
- `EMBEDDING_STORE_RUNTIME=memory` для unit/local mode без Qdrant;
- `EMBEDDING_STORE_RUNTIME=qdrant` для Docker Compose и интеграционной среды.

Important boundary:
- backend API регистрирует metadata профилей, но не возвращает raw vectors;
- vector deletion по человеку реализован, но полноценная DB persistence синхронизация будет усилена при переключении API на SQLAlchemy repositories.

## 25. Этап 11 - frontend dashboard implementation

Реализовано:
- React/Vite dashboard shell с auth/login flow;
- session storage для local MVP token session;
- API client для auth, cameras, events, persons, models, settings, AI/vector status;
- RBAC-aware navigation: `viewer` не видит people management и write controls;
- Cameras page: список камер, status view, enable/disable, FPS update, add camera;
- Events page: фильтры camera/type/date, event table, authorized snapshot metadata view;
- People page: create person, upload recognition photo, register embedding metadata, delete embeddings;
- Settings page: thresholds, retention, model registry, vector DB status;
- Vite proxy для `/api` и `/ai`.

Important boundary:
- dashboard не получает raw embeddings;
- snapshot preview пока показывает private storage key после авторизованного запроса, фактическая потоковая отдача файла будет усилена на security/storage этапах;
- API persistence остается in-memory до переключения backend на SQLAlchemy repositories.
