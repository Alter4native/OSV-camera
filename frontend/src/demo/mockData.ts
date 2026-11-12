import type { Session } from "../auth/session";
import type { Camera, EventRecord, ModelVersion, Person, QualityAnalysis, Settings, SnapshotMetadata, User } from "../types";

const now = Date.now();
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const previewUser: User = {
  user_id: "preview-user",
  username: "ui-preview",
  role: "admin",
  is_active: true,
};

export const previewSession: Session = {
  tokens: {
    access_token: "frontend-preview-only",
    refresh_token: "frontend-preview-only",
    token_type: "bearer",
  },
  user: previewUser,
};

export const previewCameras: Camera[] = [
  {
    camera_id: "preview-entrance",
    name: "Главный вход",
    source_type: "webcam",
    source_uri: "browser preview",
    enabled: false,
    processing_fps: 8,
    state: "stopped",
    last_frame_at: null,
    last_error: null,
    created_at: minutesAgo(60 * 24),
    updated_at: minutesAgo(8),
  },
  {
    camera_id: "preview-lobby",
    name: "Холл · макет",
    source_type: "rtsp",
    source_uri: "rtsp://preview.local/stream",
    enabled: false,
    processing_fps: 5,
    state: "offline",
    last_frame_at: minutesAgo(42),
    last_error: null,
    created_at: minutesAgo(60 * 24 * 3),
    updated_at: minutesAgo(42),
  },
];

export const previewEvents: EventRecord[] = [
  {
    event_id: "preview-event-1",
    camera_id: "preview-entrance",
    event_type: "person_detected",
    timestamp: minutesAgo(3),
    confidence: 0.94,
    snapshot_url: "preview-only",
    metadata: { person_count: 2 },
  },
  {
    event_id: "preview-event-2",
    camera_id: "preview-entrance",
    event_type: "known_person_detected",
    timestamp: minutesAgo(18),
    confidence: 0.89,
    snapshot_url: "preview-only",
    metadata: { person_count: 1 },
  },
  {
    event_id: "preview-event-3",
    camera_id: "preview-lobby",
    event_type: "camera_offline",
    timestamp: minutesAgo(42),
    confidence: 1,
    snapshot_url: null,
    metadata: { reason: "preview sample" },
  },
];

export const previewPeople: Person[] = [
  {
    person_id: "preview-person-1",
    display_name: "Александр Иванов",
    external_id: "EMP-014",
    notes: "Демо-профиль",
    photo_count: 2,
    created_at: minutesAgo(60 * 24 * 7),
    updated_at: minutesAgo(60 * 24),
  },
  {
    person_id: "preview-person-2",
    display_name: "Мария Садыкова",
    external_id: "EMP-021",
    notes: "Демо-профиль",
    photo_count: 1,
    created_at: minutesAgo(60 * 24 * 4),
    updated_at: minutesAgo(60 * 24 * 2),
  },
  {
    person_id: "preview-person-3",
    display_name: "Тимур Абдрахманов",
    external_id: null,
    notes: "Ожидает фотографии",
    photo_count: 0,
    created_at: minutesAgo(60 * 24),
    updated_at: minutesAgo(60 * 24),
  },
];

export const previewModels: ModelVersion[] = [
  {
    model_id: "preview-model-1",
    name: "YOLO26n",
    version: "preview",
    runtime: "Ultralytics",
    path: "local preview data",
    active: false,
    created_at: minutesAgo(60 * 24 * 14),
  },
];

export const previewQuality: QualityAnalysis = {
  status: "preview",
  generated_at: minutesAgo(15),
  dataset: { samples: 128, source: "preview data" },
  algorithms: [
    {
      algorithm: "DBSCAN",
      status: "ready",
      samples: 128,
      parameters: { eps: 0.35, min_samples: 4 },
      metrics: { silhouette: 0.71, noise_ratio: "6%" },
      analysis: ["Пример сводки для проверки отображения карточки."],
      recommendations: ["Демо-данные не отражают работу реального backend."],
    },
    {
      algorithm: "K-Means",
      status: "ready",
      samples: 128,
      parameters: { clusters: 3, max_iter: 100 },
      metrics: { silhouette: 0.68, inertia: 24.2 },
      analysis: ["Данные предназначены только для визуального preview."],
      recommendations: ["Подключите backend для реальных расчётов."],
    },
  ],
};

export const previewSettings: Settings = {
  processing_fps: 8,
  person_confidence_threshold: 0.65,
  face_recognition_threshold: 0.65,
  event_cooldown_seconds: 60,
  retention_days: 30,
};

export const previewSnapshot: SnapshotMetadata = {
  event_id: "preview-event-1",
  snapshot_storage_key: "preview/sample-frame.jpg",
  access: "authorized",
};

export const previewAiStatus = {
  status: "disabled",
  mode: "frontend-only",
  message: "Backend and AI service are not queried in this preview.",
};

export const previewVectorStatus = {
  status: "preview",
  collection: "person_face_embeddings",
  points_count: 18,
  source: "sample data",
};

export const previewEmbeddingStatus = {
  status: "preview",
  profiles: 2,
  source: "sample data",
};
