# OSV-PC - People counting TODO Plan

## Краткое резюме

OSV-PC - модульная система компьютерного зрения для People counting на RTSP/USB камерах. Основной поток MVP: camera -> video ingestion -> frame processor -> YOLO person detector -> tracker -> face recognition / future Person Re-ID -> event engine -> backend API -> PostgreSQL/vector DB/object storage -> dashboard/alerts.

Текущий анализ workspace: проект перенесен в `C:\Users\isari\Cursor\ai-camera-platform`. Готового runtime-кода, моделей и датасетов пока нет. План ниже является исходным production-oriented backlog для MVP и дальнейшего развития.

## Базовые дефолты MVP

- Основной язык: Python.
- AI service: FastAPI, OpenCV/GStreamer, PyTorch/Ultralytics YOLO, ByteTrack, ONNX Runtime как первый portable runtime.
- Backend API: FastAPI, SQLAlchemy/Alembic, PostgreSQL, Redis.
- Frontend: React + TypeScript + Vite.
- Vector DB: Qdrant для MVP; pgvector оставить как альтернативу.
- Snapshot storage: локальное файловое хранилище в MVP, S3-compatible MinIO как следующий шаг.
- Deployment: Docker Compose.
- Auth: JWT access/refresh tokens, RBAC roles `admin`, `operator`, `viewer`.
- Privacy: минимизация PII, retention policy, закрытый доступ к snapshots только через API.
- Hardware: CPU-only baseline, GPU acceleration optional через CUDA/TensorRT/OpenVINO по окружению.
- MVP cameras: 1 камера.
- MVP hardware: локальное железо, без обязательной GPU-зависимости.
- MVP scope: detection + tracking + face recognition + events + backend + dashboard сразу.
- MVP detection scope: только люди. Предметы и generic object classes не входят в MVP.
- MVP event types: `person_detected`, `known_person_detected`, `unknown_person_detected`, `restricted_zone_entry`, `camera_offline`, `people_count`.
- Retention: события и snapshots хранятся 30 дней.
- Biometrics: embeddings известных людей можно хранить в vector DB; исходные фото доступны только `admin`/`operator` через авторизованный API.

## Правила исполнения

- Двигаться строго по этапам.
- После каждого этапа фиксировать результат, проверку, оставшиеся риски и следующий шаг.
- Код не писать до завершения этапов 0-2.
- Каждый сервис должен иметь healthcheck, конфигурацию через `.env`, тесты и минимальную документацию.

---

## Этап 0 - Уточнение требований

**Цель:** зафиксировать границы MVP, дефолты и вопросы, без которых архитектура может быть ошибочной.

**Задачи:**
- Подтвердить тип камер: RTSP, USB/webcam, количество камер для MVP.
- Подтвердить целевое железо: CPU, NVIDIA GPU, Intel CPU/iGPU, edge device.
- Подтвердить сценарий recognition: лица, известные люди, unknown, будущий Person Re-ID.
- Подтвердить правила событий и зоны: какие события обязательны в MVP.
- Подтвердить требования к хранению snapshots и срокам retention.
- Подтвердить формат deployment: локальный Docker Compose или сервер.
- Подтвердить допустимость хранения biometric embeddings и требования приватности.
- Зафиксировать дефолты, если ответов пока нет.

**Файлы создать/изменить:**
- `docs/todo.md`
- позже: `docs/architecture.md`
- позже: `docs/privacy-security.md`

**Ожидаемый результат:**
- Список подтвержденных требований.
- Список открытых вопросов.
- Набор дефолтов для движения к архитектуре.

**Подтвержденные требования:**
- MVP поддерживает одну камеру.
- Первый запуск выполняется на локальном железе.
- Система сразу включает детекцию людей, трекинг, face recognition, события, backend и dashboard.
- Детекция предметов не входит в MVP; YOLO используется как person detector.
- Обязательные события MVP: `person_detected`, `known_person_detected`, `unknown_person_detected`, `restricted_zone_entry`, `camera_offline`, `people_count`.
- Retention по умолчанию: 30 дней.
- Face embeddings известных людей разрешено хранить в vector DB.
- Исходные фото людей должны быть доступны только `admin` и `operator` через авторизованный API.

**Открытые вопросы:**
- Тип первой камеры: RTSP или USB/webcam.
- Нужно ли в MVP задавать restricted zone через dashboard или достаточно конфигурации в backend.

**Критерии готовности:**
- MVP scope понятен.
- Нет блокирующих вопросов для проектирования архитектуры.
- Все спорные решения имеют дефолт.

**Команды запуска/проверки:**
```powershell
Get-ChildItem -Recurse .\ai-camera-platform\docs
Get-Content .\ai-camera-platform\docs\todo.md
git status --short
```

**Возможные ошибки:**
- Не определено целевое железо, из-за чего выбран неправильный inference runtime.
- Не определена политика хранения PII/biometrics.
- Слишком широкий MVP: detection, tracking, recognition, dashboard и alerts одновременно без приоритета.

**Следующий шаг:** перейти к этапу 1 и спроектировать архитектуру на основе подтвержденных дефолтов.

---

## Этап 1 - Архитектура проекта

**Цель:** спроектировать сервисы, границы ответственности, контракты API и поток данных.

**Задачи:**
- Описать target architecture: `ai-service`, `backend`, `frontend`, `postgres`, `redis`, `qdrant`, `nginx`, storage.
- Определить sync/async взаимодействие: REST API, Redis queues/pub-sub, internal HTTP.
- Описать video pipeline: camera reader -> frame sampler -> detector -> tracker -> recognizer -> event engine.
- Описать модель данных: cameras, events, persons, embeddings, models, settings, audit logs.
- Определить правила idempotency/dedup для событий.
- Определить API boundaries: backend владеет данными и auth, ai-service отправляет events.
- Спроектировать snapshot access: private storage, выдача через backend с авторизацией.
- Описать threat model высокого уровня.

**Файлы создать/изменить:**
- `docs/architecture.md`
- `docs/privacy-security.md`
- `docs/deployment.md`
- `infra/.env.example`
- `ai-service/app/config.py` позже на этапе 2
- `backend/src/config.py` позже на этапе 2

**Ожидаемый результат:**
- Архитектурный документ с диаграммой сервисов и sequence flow.
- Зафиксированные интерфейсы между сервисами.
- Решение по MVP runtime и storage.

**Критерии готовности:**
- Понятно, какой сервис что делает.
- Понятно, где хранятся события, snapshots, embeddings и настройки.
- Понятно, как добавлять новые камеры, модели и правила.

**Команды запуска/проверки:**
```powershell
Get-Content .\ai-camera-platform\docs\architecture.md
Get-Content .\ai-camera-platform\docs\privacy-security.md
```

**Возможные ошибки:**
- Смешивание AI pipeline и бизнес API в одном сервисе.
- Прямая раздача snapshot файлов без авторизации.
- Отсутствие dedup событий и перегрузка БД событиями на каждом кадре.

**Следующий шаг:** подготовить окружение и каркас репозитория.

---

## Этап 2 - Подготовка окружения

**Цель:** создать структуру проекта, базовые конфиги, зависимости и команды разработки.

**Задачи:**
- Создать директории по требуемой структуре.
- Добавить `.env.example`, `.gitignore`, `README.md`.
- Создать Python package для `ai-service`.
- Создать Python package для `backend`.
- Создать frontend Vite React TypeScript проект.
- Добавить минимальные Dockerfile для сервисов.
- Добавить базовые тестовые конфиги.
- Добавить lint/format команды.

**Файлы создать/изменить:**
- `README.md`
- `.gitignore`
- `.env.example`
- `ai-service/app/main.py`
- `ai-service/app/config.py`
- `ai-service/requirements.txt`
- `ai-service/Dockerfile`
- `backend/src/main.py`
- `backend/src/config.py`
- `backend/requirements.txt`
- `backend/Dockerfile`
- `frontend/package.json`
- `frontend/src/main.tsx`
- `frontend/Dockerfile`
- `infra/docker-compose.yml`

**Ожидаемый результат:**
- Репозиторий запускается в dev mode.
- Health endpoints доступны для backend и ai-service.
- Frontend открывается локально.

**Критерии готовности:**
- `python -m pytest` проходит для backend и ai-service.
- `npm run build` проходит для frontend.
- `docker compose config` валиден.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
python -m venv .venv
.\.venv\Scripts\python -m pip install -r .\ai-service\requirements.txt
.\.venv\Scripts\python -m pip install -r .\backend\requirements.txt
docker compose -f .\infra\docker-compose.yml config
```

**Возможные ошибки:**
- Конфликт версий OpenCV/PyTorch/Ultralytics.
- Неправильные пути volume в Docker Compose на Windows.
- Переменные окружения не разделены между сервисами.

**Следующий шаг:** реализовать video ingestion.

---

## Этап 3 - Video ingestion

**Цель:** подключать RTSP и USB/webcam камеры, читать кадры стабильно и контролировать FPS обработки.

**Задачи:**
- Реализовать `CameraSource` interface.
- Реализовать `RTSPCameraSource`.
- Реализовать `WebcamCameraSource`.
- Добавить reconnect/backoff при обрыве потока.
- Добавить frame sampling по `processing_fps`.
- Добавить status monitoring: online/offline, last_frame_at, error.
- Добавить mock/video-file source для тестов.
- Добавить метрики FPS и latency чтения.

**Файлы создать/изменить:**
- `ai-service/app/video/source.py`
- `ai-service/app/video/rtsp.py`
- `ai-service/app/video/webcam.py`
- `ai-service/app/video/sampler.py`
- `ai-service/app/video/manager.py`
- `ai-service/app/video/status.py`
- `ai-service/tests/test_video_sources.py`
- `docs/architecture.md`

**Ожидаемый результат:**
- AI service может открыть RTSP/USB/video-file source.
- Камера получает статус online/offline.
- Обрыв потока не роняет сервис.

**Критерии готовности:**
- Reconnect работает с backoff.
- FPS обработки ограничивается настройкой.
- Тесты покрывают happy path и offline source.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python -m pytest .\tests\test_video_sources.py
python -m app.main
```

**Возможные ошибки:**
- RTSP stream зависает без timeout.
- OpenCV backend не поддерживает конкретный codec.
- Слишком высокий FPS перегружает detector.

**Следующий шаг:** подключить person detection на базе YOLO.

---

## Этап 4 - Object detection

**Цель:** добавить YOLO person detector с thresholds и сохранением bounding boxes. В MVP детектируется только класс `person`; предметы и generic object classes исключены.

**Задачи:**
- Реализовать общий `ObjectDetector` interface.
- Реализовать `YoloDetector`.
- Добавить загрузку модели из `models/`.
- Добавить confidence threshold per camera.
- Ограничить inference классом `person`.
- Нормализовать detection result schema.
- Подготовить extension point для future custom classes без включения их в MVP.
- Добавить warmup модели.
- Добавить измерение inference latency.

**Файлы создать/изменить:**
- `ai-service/app/detection/base.py`
- `ai-service/app/detection/yolo.py`
- `ai-service/app/detection/schemas.py`
- `ai-service/models/README.md`
- `ai-service/tests/test_detection.py`
- `docs/training.md`

**Ожидаемый результат:**
- AI service получает кадр и возвращает список detections людей с bbox, class_id, class_name, confidence.

**Критерии готовности:**
- Модель загружается из конфигурации.
- Threshold применяется корректно.
- Все не-person классы отфильтрованы.
- Результаты сериализуемы в events metadata.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python -m pytest .\tests\test_detection.py
```

**Возможные ошибки:**
- Несовпадение формата bbox: xyxy vs xywh.
- Модель отсутствует в volume.
- CUDA доступна в host, но не доступна внутри контейнера.

**Следующий шаг:** добавить tracking.

---

## Этап 5 - Tracking

**Цель:** назначать стабильные `track_id` объектам и снижать дублирование событий.

**Задачи:**
- Выбрать ByteTrack как MVP tracker.
- Реализовать `Tracker` interface.
- Преобразовать detections в формат tracker.
- Хранить track state per camera.
- Возвращать `track_id`, bbox, class, confidence.
- Добавить TTL для потерянных tracks.
- Подготовить extension point для DeepSORT.
- Добавить тесты на стабильность track IDs.

**Файлы создать/изменить:**
- `ai-service/app/tracking/base.py`
- `ai-service/app/tracking/bytetrack.py`
- `ai-service/app/tracking/state.py`
- `ai-service/tests/test_tracking.py`
- `docs/architecture.md`

**Ожидаемый результат:**
- Для последовательности кадров один объект получает стабильный `track_id`.

**Критерии готовности:**
- Event engine может использовать `camera_id + track_id + event_type` для dedup.
- Tracker не ломает pipeline при пустых detections.
- Track state изолирован между камерами.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python -m pytest .\tests\test_tracking.py
```

**Возможные ошибки:**
- Track IDs смешиваются между камерами.
- Дубликаты при кратковременной потере объекта.
- Неверная частота кадров ухудшает качество трекинга.

**Следующий шаг:** реализовать Event Engine.

---

## Этап 6 - Events

**Цель:** создавать события только при выполнении правил и не писать события на каждом кадре.

**Задачи:**
- Реализовать event rules engine.
- Добавить event types: `person_detected`, `known_person_detected`, `unknown_person_detected`, `restricted_zone_entry`, `camera_offline`, `people_count`.
- Добавить dedup window и cooldown per track/event.
- Добавить restricted zones polygon rules.
- Добавить snapshot capture при событии.
- Добавить event publisher в backend API или Redis queue.
- Добавить metadata schema.
- Добавить тесты правил и dedup.

**Файлы создать/изменить:**
- `ai-service/app/events/engine.py`
- `ai-service/app/events/rules.py`
- `ai-service/app/events/schemas.py`
- `ai-service/app/events/publisher.py`
- `ai-service/app/storage/snapshots.py`
- `ai-service/tests/test_events.py`
- `docs/architecture.md`

**Ожидаемый результат:**
- События создаются по правилам, со snapshot и metadata.
- `people_count` обновляется агрегированно по камере, а не создает событие на каждый кадр.

**Критерии готовности:**
- Один и тот же track не создает событие каждый кадр.
- Offline event создается при потере камеры.
- Snapshot путь не является публичным URL без авторизации.
- Generic `object_detected` не создается в MVP.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python -m pytest .\tests\test_events.py
```

**Возможные ошибки:**
- Event storm при высокой частоте кадров.
- Snapshot создается, но событие не записывается.
- Неверная геометрия restricted zone.

**Следующий шаг:** реализовать backend API.

---

## Этап 7 - Backend API

**Цель:** предоставить защищенный API для камер, событий, людей, моделей и настроек.

**Задачи:**
- Реализовать FastAPI app structure.
- Добавить auth endpoints: login, refresh, me.
- Добавить RBAC dependency.
- Реализовать cameras CRUD/status API.
- Реализовать events list/detail/filter API.
- Реализовать persons CRUD API.
- Реализовать models registry API.
- Реализовать settings/thresholds API.
- Реализовать internal endpoint для приема событий от ai-service.
- Добавить OpenAPI tags и schemas.

**Файлы создать/изменить:**
- `backend/src/main.py`
- `backend/src/api/routes_auth.py`
- `backend/src/api/routes_cameras.py`
- `backend/src/api/routes_events.py`
- `backend/src/api/routes_persons.py`
- `backend/src/api/routes_models.py`
- `backend/src/api/routes_settings.py`
- `backend/src/api/routes_internal.py`
- `backend/src/auth/`
- `backend/src/schemas/`
- `backend/tests/test_api_*.py`

**Ожидаемый результат:**
- Backend API обслуживает основные workflow MVP.

**Критерии готовности:**
- Все публичные endpoints требуют auth, кроме health/login.
- RBAC ограничивает write operations.
- Internal endpoints защищены service token.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\backend
python -m pytest
uvicorn src.main:app --reload
```

**Возможные ошибки:**
- Нет разграничения internal/public API.
- Viewer может менять настройки или удалять данные.
- Фильтры событий не индексируются на уровне БД.

**Следующий шаг:** спроектировать и применить database schema.

---

## Этап 8 - Database schema

**Цель:** создать надежную схему PostgreSQL для камер, событий, пользователей, людей, моделей, настроек и аудита.

**Задачи:**
- Настроить SQLAlchemy models.
- Настроить Alembic migrations.
- Создать таблицы `users`, `roles`, `cameras`, `camera_settings`.
- Создать таблицы `events`, `event_snapshots`, `event_metadata`.
- Создать таблицы `persons`, `person_photos`, `recognition_profiles`.
- Создать таблицы `models`, `model_versions`.
- Создать таблицы `audit_logs`, `retention_jobs`.
- Добавить индексы для фильтров events.
- Добавить seed admin user для dev.

**Файлы создать/изменить:**
- `backend/database/alembic.ini`
- `backend/database/migrations/`
- `backend/src/db/session.py`
- `backend/src/db/models/*.py`
- `backend/src/db/repositories/*.py`
- `backend/src/db/seed.py`
- `docs/architecture.md`

**Ожидаемый результат:**
- PostgreSQL schema создается миграциями и поддерживает API.

**Критерии готовности:**
- `alembic upgrade head` проходит.
- Таблицы имеют внешние ключи и индексы.
- Event filters работают по camera/date/type.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\backend
alembic -c .\database\alembic.ini upgrade head
python -m pytest .\tests
```

**Возможные ошибки:**
- JSON metadata используется без индексов там, где нужны частые фильтры.
- Нет cascade/retention стратегии для snapshots.
- Миграции завязаны на dev-only значения.

**Следующий шаг:** добавить face recognition и embeddings.

---

## Этап 9 - Face recognition / embeddings

**Цель:** распознавать известных людей по лицам и возвращать `known` / `unknown`.

**Задачи:**
- Выбрать face detector/embedding model для MVP.
- Реализовать `FaceRecognizer` interface.
- Реализовать face detection/crop/alignment.
- Генерировать embedding для лица.
- Добавить enrollment workflow из фото человека.
- Добавить threshold matching.
- Сохранять результат recognition в event metadata.
- Подготовить future module boundary для Person Re-ID.

**Файлы создать/изменить:**
- `ai-service/app/recognition/base.py`
- `ai-service/app/recognition/face.py`
- `ai-service/app/recognition/person_reid.py`
- `ai-service/app/recognition/schemas.py`
- `backend/src/api/routes_persons.py`
- `backend/src/services/persons.py`
- `ai-service/tests/test_recognition.py`
- `docs/privacy-security.md`

**Ожидаемый результат:**
- Изображение лица превращается в embedding.
- Известный человек определяется при превышении threshold.
- Unknown корректно помечается без создания ложного known match.

**Критерии готовности:**
- Enrollment работает через backend API.
- Embeddings не пишутся в logs.
- Threshold настраивается.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python -m pytest .\tests\test_recognition.py
```

**Возможные ошибки:**
- Низкое качество лица дает false positive.
- Embedding model несовместима между enrollment и inference.
- Хранение исходных фото нарушает privacy policy.

**Следующий шаг:** подключить vector database.

---

## Этап 10 - Vector database

**Цель:** хранить и искать embeddings известных людей через Qdrant или pgvector.

**Задачи:**
- Поднять Qdrant в Docker Compose.
- Создать collection для person embeddings.
- Реализовать vector repository.
- Добавить upsert/delete embeddings при изменении person.
- Добавить search by embedding.
- Синхронизировать metadata: `person_id`, `photo_id`, `model_version`.
- Добавить healthcheck vector DB.
- Добавить тесты с test container или mocked repository.

**Файлы создать/изменить:**
- `infra/docker-compose.yml`
- `ai-service/app/recognition/vector_store.py`
- `backend/src/services/embeddings.py`
- `backend/src/api/routes_persons.py`
- `backend/tests/test_embeddings.py`
- `docs/deployment.md`

**Ожидаемый результат:**
- Recognition может быстро находить ближайшие embeddings.

**Критерии готовности:**
- Collection создается автоматически или через init step.
- Search возвращает score и person_id.
- Delete person удаляет связанные embeddings.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
docker compose -f .\infra\docker-compose.yml up -d qdrant
docker compose -f .\infra\docker-compose.yml ps
```

**Возможные ошибки:**
- Несовпадение размерности embedding vector.
- Старые embeddings остаются после переобучения/смены модели.
- Score threshold интерпретируется неверно для cosine/dot/euclidean.

**Следующий шаг:** реализовать frontend dashboard.

---

## Этап 11 - Frontend dashboard

**Цель:** дать операторам интерфейс для камер, событий, snapshots, людей и настроек.

**Задачи:**
- Настроить React + TypeScript + Vite.
- Реализовать auth/login flow.
- Реализовать layout с ролями.
- Реализовать список камер и status view.
- Реализовать events table с фильтрами camera/date/type.
- Реализовать event detail со snapshot.
- Реализовать people management и загрузку фото.
- Реализовать thresholds/settings UI.
- Добавить API client и error handling.

**Файлы создать/изменить:**
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/api/client.ts`
- `frontend/src/auth/`
- `frontend/src/pages/Cameras.tsx`
- `frontend/src/pages/Events.tsx`
- `frontend/src/pages/People.tsx`
- `frontend/src/pages/Settings.tsx`
- `frontend/src/components/`
- `frontend/src/styles/`

**Ожидаемый результат:**
- Dashboard позволяет выполнять основные операции MVP.

**Критерии готовности:**
- Viewer не видит write controls.
- События фильтруются без перезагрузки страницы.
- Snapshot отображается только после авторизованного запроса.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\frontend
npm install
npm run build
npm run dev
```

**Возможные ошибки:**
- Frontend хранит access token небезопасно.
- Большие списки событий тормозят без pagination.
- Snapshot URL становится публичным.

**Следующий шаг:** подготовить training pipeline.

---

## Этап 12 - Training pipeline

**Цель:** обеспечить дообучение YOLO на custom dataset.

**Задачи:**
- Описать dataset format.
- Добавить структуру `datasets/`.
- Добавить data validation script.
- Добавить YOLO training config.
- Добавить training runner.
- Добавить export of metrics.
- Добавить model registry update после успешного обучения.
- Добавить инструкцию по annotation workflow.

**Файлы создать/изменить:**
- `ai-service/datasets/README.md`
- `ai-service/training/train_yolo.py`
- `ai-service/training/validate_dataset.py`
- `ai-service/training/configs/yolo_custom.yaml`
- `ai-service/training/README.md`
- `docs/dataset.md`
- `docs/training.md`

**Ожидаемый результат:**
- Пользователь может подготовить dataset и запустить training.

**Критерии готовности:**
- Dataset validation ловит отсутствующие labels/images/classes.
- Training сохраняет веса и метрики.
- Новый model version можно зарегистрировать.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python .\training\validate_dataset.py --dataset .\datasets\custom
python .\training\train_yolo.py --config .\training\configs\yolo_custom.yaml
```

**Возможные ошибки:**
- Неверная разметка YOLO labels.
- Class names в dataset не совпадают с inference config.
- Недостаточно GPU/VRAM для выбранной модели.

**Следующий шаг:** экспортировать и оптимизировать модель.

---

## Этап 13 - Model export and optimization

**Цель:** подготовить модели для production inference: ONNX, TensorRT, OpenVINO.

**Задачи:**
- Добавить export script YOLO -> ONNX.
- Добавить ONNX Runtime inference adapter.
- Добавить TensorRT export path для NVIDIA.
- Добавить OpenVINO export path для Intel.
- Добавить benchmark script.
- Сравнить latency/FPS/accuracy на sample videos.
- Добавить model version metadata.
- Описать runtime selection config.

**Файлы создать/изменить:**
- `ai-service/training/export_model.py`
- `ai-service/app/detection/onnx.py`
- `ai-service/app/detection/tensorrt.py`
- `ai-service/app/detection/openvino.py`
- `ai-service/training/benchmark.py`
- `docs/training.md`
- `docs/deployment.md`

**Ожидаемый результат:**
- Модель может запускаться через portable runtime и оптимизированные runtime по окружению.

**Критерии готовности:**
- ONNX inference дает сопоставимые bbox с PyTorch.
- Benchmark пишет latency p50/p95 и FPS.
- Runtime выбирается конфигом без изменения кода pipeline.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\ai-service
python .\training\export_model.py --format onnx --model .\models\best.pt
python .\training\benchmark.py --model .\models\best.onnx --video .\datasets\samples\sample.mp4
```

**Возможные ошибки:**
- Dynamic/static input shape mismatch.
- TensorRT engine зависит от конкретной GPU/driver версии.
- OpenVINO export требует отдельной проверки precision.

**Следующий шаг:** собрать Docker deployment.

---

## Этап 14 - Docker deployment

**Цель:** запустить весь MVP через Docker Compose с отдельными сервисами.

**Задачи:**
- Настроить Dockerfile для ai-service.
- Настроить Dockerfile для backend.
- Настроить Dockerfile для frontend.
- Настроить Compose services: ai-service, backend, frontend, postgres, redis, qdrant, nginx.
- Добавить volumes для models, snapshots, postgres, qdrant.
- Добавить healthchecks.
- Добавить nginx reverse proxy.
- Добавить `.env.example` для всех сервисов.

**Файлы создать/изменить:**
- `infra/docker-compose.yml`
- `infra/nginx/nginx.conf`
- `infra/postgres/init.sql`
- `infra/redis/redis.conf`
- `ai-service/Dockerfile`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `.env.example`
- `docs/deployment.md`

**Ожидаемый результат:**
- Весь MVP поднимается одной командой.

**Критерии готовности:**
- `docker compose up` поднимает все сервисы.
- Healthchecks зеленые.
- Frontend работает через nginx.
- Backend видит Postgres/Redis/Qdrant.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
docker compose -f .\infra\docker-compose.yml up --build
docker compose -f .\infra\docker-compose.yml ps
```

**Возможные ошибки:**
- Windows path volumes ломают snapshot/model directories.
- GPU runtime не доступен в Docker.
- Nginx проксирует snapshots в обход backend auth.

**Следующий шаг:** усилить security.

---

## Этап 15 - Security

**Цель:** защитить API, snapshots, credentials, роли и персональные данные.

**Задачи:**
- Реализовать JWT auth и refresh token rotation.
- Реализовать RBAC policies.
- Реализовать service-to-service token для ai-service -> backend.
- Закрыть snapshots за backend endpoint.
- Добавить audit logging действий пользователей.
- Добавить rate limit через Redis.
- Добавить secrets policy: `.env`, no secrets in repo.
- Описать privacy и retention policy.
- Добавить удаление старых событий/snapshots.

**Файлы создать/изменить:**
- `backend/src/auth/`
- `backend/src/security/`
- `backend/src/middleware/audit.py`
- `backend/src/middleware/rate_limit.py`
- `backend/src/services/retention.py`
- `backend/tests/test_security.py`
- `docs/privacy-security.md`
- `.env.example`

**Ожидаемый результат:**
- API и snapshots доступны только авторизованным пользователям с нужной ролью.

**Критерии готовности:**
- Viewer не может создавать/удалять камеры, людей, модели.
- Snapshot нельзя открыть прямым файловым URL.
- Audit logs пишут кто, что, когда сделал.
- Retention job удаляет старые данные.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform\backend
python -m pytest .\tests\test_security.py
```

**Возможные ошибки:**
- Access token живет слишком долго.
- Refresh tokens не инвалидируются.
- Логи содержат biometric embeddings или секреты.

**Следующий шаг:** добавить monitoring.

---

## Этап 16 - Monitoring

**Цель:** наблюдать FPS, latency, camera status, events count, model errors и health сервиса.

**Задачи:**
- Добавить structured logging.
- Добавить `/health` и `/metrics` endpoints.
- Добавить AI metrics: camera FPS, frame read latency, inference latency, recognition latency.
- Добавить backend metrics: request latency, error rate, events count.
- Добавить camera status monitor.
- Добавить Prometheus config.
- Добавить Grafana dashboard skeleton.
- Добавить alert rules для camera_offline и model errors.

**Файлы создать/изменить:**
- `ai-service/app/utils/logging.py`
- `ai-service/app/utils/metrics.py`
- `backend/src/observability/`
- `infra/monitoring/prometheus.yml`
- `infra/monitoring/grafana/`
- `docs/deployment.md`

**Ожидаемый результат:**
- Состояние платформы видно через health/metrics и dashboard.

**Критерии готовности:**
- Metrics endpoints возвращают данные.
- Offline camera видна как метрика и событие.
- Latency/FPS логируются per camera.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
docker compose -f .\infra\docker-compose.yml up -d
curl http://localhost/api/health
curl http://localhost/ai/health
```

**Возможные ошибки:**
- Метрики имеют слишком высокую cardinality.
- Логи содержат PII.
- Healthcheck проверяет только процесс, но не зависимости.

**Следующий шаг:** провести testing.

---

## Этап 17 - Testing

**Цель:** покрыть критические сценарии unit, integration и end-to-end тестами.

**Задачи:**
- Unit tests для video, detection adapters, tracking, event rules.
- Backend API tests с test database.
- Integration tests ai-service -> backend event ingestion.
- Frontend tests для основных screens.
- E2E тест: camera source -> event -> API -> dashboard.
- Load test для events API.
- Test fixtures: sample images/videos.
- CI workflow для tests/build.

**Файлы создать/изменить:**
- `ai-service/tests/`
- `backend/tests/`
- `frontend/src/**/*.test.tsx`
- `tests/e2e/`
- `.github/workflows/ci.yml`
- `docs/testing.md` или раздел в `docs/deployment.md`

**Ожидаемый результат:**
- Основные риски MVP проверяются автоматизированно.

**Критерии готовности:**
- Unit/integration tests проходят локально.
- E2E сценарий создает событие из sample video.
- CI собирает backend, ai-service и frontend.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
python -m pytest .\ai-service\tests
python -m pytest .\backend\tests
cd .\frontend
npm test
npm run build
```

**Возможные ошибки:**
- Tests требуют реальную камеру.
- Snapshot tests нестабильны.
- Integration tests зависят от порядка запуска сервисов.

**Следующий шаг:** подготовить MVP release.

---

## Этап 18 - MVP release

**Цель:** собрать минимально рабочую версию для демонстрации и пилота.

**Задачи:**
- Заморозить MVP scope.
- Проверить полный Docker Compose запуск.
- Подготовить demo dataset/sample video.
- Подготовить dev admin account.
- Подготовить release notes.
- Проверить security baseline.
- Проверить backup/restore для PostgreSQL и snapshots.
- Подготовить инструкцию запуска.

**Файлы создать/изменить:**
- `README.md`
- `docs/deployment.md`
- `docs/privacy-security.md`
- `docs/release-notes.md`
- `.env.example`
- `infra/docker-compose.yml`

**Ожидаемый результат:**
- MVP можно поднять и показать end-to-end.

**Критерии готовности:**
- Камера или sample video создает событие.
- Event виден в dashboard.
- Snapshot доступен только через auth.
- Все сервисы имеют healthchecks.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
docker compose -f .\infra\docker-compose.yml up --build
docker compose -f .\infra\docker-compose.yml ps
```

**Возможные ошибки:**
- Demo зависит от локального пути к модели.
- Нет seed данных.
- Документация запуска не совпадает с Compose.

**Следующий шаг:** сформировать production roadmap.

---

## Этап 19 - Production roadmap

**Цель:** подготовить путь от MVP к production эксплуатации.

**Задачи:**
- Описать Kubernetes migration plan.
- Добавить горизонтальное масштабирование ai workers.
- Разделить ingest/detection/event services при росте нагрузки.
- Добавить GPU node scheduling.
- Добавить managed object storage.
- Добавить backup/DR policy.
- Добавить model registry и approval workflow.
- Добавить privacy review и data retention automation.
- Добавить alerting/on-call runbooks.

**Файлы создать/изменить:**
- `docs/production-roadmap.md`
- `docs/deployment.md`
- `docs/privacy-security.md`
- `infra/k8s/` позже
- `infra/monitoring/`

**Ожидаемый результат:**
- Понятный план production hardening и масштабирования.

**Критерии готовности:**
- Известны bottlenecks MVP.
- Есть план миграции на Kubernetes.
- Есть требования к hardware sizing.
- Есть политика обновления моделей и данных.

**Команды запуска/проверки:**
```powershell
cd .\ai-camera-platform
Get-Content .\docs\production-roadmap.md
```

**Возможные ошибки:**
- Production roadmap не учитывает privacy/legal constraints.
- Масштабирование AI inference планируется без оценки GPU/CPU latency.
- Нет стратегии model rollback.

**Следующий шаг:** переходить к production hardening после подтверждения MVP.

---

## Статус выполнения

- Этап 0: выполнен, требования MVP подтверждены.
- Этап 1: выполнен, архитектура зафиксирована в `docs/architecture.md`, `docs/privacy-security.md`, `docs/deployment.md`, `infra/.env.example`.
- Этап 2: выполнен, создан каркас сервисов, frontend shell, Docker Compose, nginx, `.env.example`, README и smoke tests.
- Этап 3: выполнен, реализованы camera source abstractions, webcam/RTSP sources, FPS sampler, reconnect/status manager и тесты.
- Этап 4: выполнен, реализованы detection schemas, person-only YOLO adapter, detector factory, mock detector и тесты.
- Этап 5: выполнен, реализованы tracking contracts, ByteTrack-style tracker, per-camera state, стабильные `track_id`, TTL и тесты.
- Этап 6: выполнен, реализованы event schemas, EventEngine, cooldown/dedup, people_count, camera_offline, restricted zones, snapshot hooks и publisher interfaces.
- Этап 7: выполнен, реализованы backend API routes, JWT auth, RBAC, internal event ingestion и in-memory MVP store.
- Этап 8: выполнен, реализованы SQLAlchemy models, Alembic initial migration, DB repository skeleton, seed skeleton и schema tests.
- Этап 9: выполнен, реализованы face recognition contracts, deterministic embedding recognizer, known/unknown matching, Person Re-ID boundary и embedding metadata API.
- Этап 10: выполнен, реализованы Qdrant embedding store, vector status endpoints, delete embeddings flow и mocked/local Qdrant tests.
- Этап 11: выполнен, реализованы React dashboard, auth/login flow, RBAC-aware navigation, cameras/events/people/settings pages, API client и frontend smoke checks.
- Этап 12: следующий шаг.
- Этапы 13-19: не начаты.
