export type Role = "admin" | "operator" | "viewer";

export type User = {
  user_id: string;
  username: string;
  role: Role;
  is_active: boolean;
};

export type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
};

export type CameraState = "online" | "offline" | "stopped" | "error";

export type Camera = {
  camera_id: string;
  name: string;
  source_type: string;
  source_uri: string;
  enabled: boolean;
  processing_fps: number;
  state: CameraState;
  last_frame_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CameraPayload = {
  name: string;
  source_type: string;
  source_uri: string;
  enabled: boolean;
  processing_fps: number;
};

export type EventType =
  | "person_detected"
  | "known_person_detected"
  | "unknown_person_detected"
  | "restricted_zone_entry"
  | "camera_offline"
  | "people_count";

export type EventRecord = {
  event_id: string;
  camera_id: string;
  event_type: EventType;
  timestamp: string;
  confidence: number;
  snapshot_url: string | null;
  metadata: Record<string, unknown>;
};

export type SnapshotMetadata = {
  event_id: string;
  snapshot_storage_key: string;
  access: "authorized";
};

export type DetectionBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
};

export type WebcamDetection = {
  camera_id: string;
  frame_sequence: number;
  timestamp: string;
  frame: {
    width: number;
    height: number;
  };
  frame_image: string | null;
  person_count: number;
  detections: Array<{
    camera_id: string;
    frame_sequence: number;
    timestamp: string;
    bbox: DetectionBox;
    class_id: number;
    class_name: string;
    confidence: number;
  }>;
  tracks?: Array<{
    camera_id: string;
    frame_sequence: number;
    timestamp: string;
    track_id: number;
    bbox: DetectionBox;
    class_id: number;
    class_name: string;
    confidence: number;
    hits: number;
  }>;
  camera: Record<string, unknown>;
  detector: Record<string, unknown>;
};

export type Person = {
  person_id: string;
  display_name: string;
  external_id: string | null;
  notes: string | null;
  photo_count: number;
  created_at: string;
  updated_at: string;
};

export type PersonPayload = {
  display_name: string;
  external_id?: string;
  notes?: string;
};

export type PersonPhoto = {
  photo_id: string;
  person_id: string;
  filename: string;
  content_type: string | null;
  created_at: string;
};

export type PersonEmbeddingPayload = {
  photo_id?: string;
  embedding_model: string;
  embedding_dim: number;
  vector_collection: string;
  threshold: number;
};

export type PersonEmbeddingRecord = PersonEmbeddingPayload & {
  profile_id: string;
  person_id: string;
  active: boolean;
  created_at: string;
};

export type ModelVersion = {
  model_id: string;
  name: string;
  version: string;
  runtime: string;
  path: string;
  active: boolean;
  created_at: string;
};

export type AlgorithmQuality = {
  algorithm: string;
  status: string;
  samples: number;
  parameters: Record<string, unknown>;
  metrics: Record<string, unknown>;
  analysis: string[];
  recommendations: string[];
};

export type QualityAnalysis = {
  status: string;
  generated_at: string;
  dataset: Record<string, unknown>;
  algorithms: AlgorithmQuality[];
};

export type Settings = {
  processing_fps: number;
  person_confidence_threshold: number;
  face_recognition_threshold: number;
  event_cooldown_seconds: number;
  retention_days: number;
};
