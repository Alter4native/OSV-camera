import type {
  Camera,
  CameraPayload,
  EventRecord,
  EventType,
  LoginResponse,
  ModelVersion,
  Person,
  PersonEmbeddingPayload,
  PersonEmbeddingRecord,
  PersonPayload,
  PersonPhoto,
  QualityAnalysis,
  Settings,
  SnapshotMetadata,
  User,
  WebcamDetection,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const AI_BASE_URL = import.meta.env.VITE_AI_BASE_URL ?? "/ai";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type RequestOptions = RequestInit & {
  token?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: unknown };
      if (typeof payload.detail === "string") {
        message = payload.detail;
      } else if (payload.detail && typeof payload.detail === "object" && "message" in payload.detail) {
        message = String((payload.detail as { message: unknown }).message);
      }
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  return parseResponse<T>(response);
}

async function aiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${AI_BASE_URL}${path}`, options);
  return parseResponse<T>(response);
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getMe(token: string): Promise<User> {
  return apiFetch<User>("/me", { token });
}

export function listCameras(token: string): Promise<Camera[]> {
  return apiFetch<Camera[]>("/cameras", { token });
}

export function createCamera(token: string, payload: CameraPayload): Promise<Camera> {
  return apiFetch<Camera>("/cameras", {
    token,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCamera(token: string, cameraId: string, payload: Partial<CameraPayload>): Promise<Camera> {
  return apiFetch<Camera>(`/cameras/${cameraId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type EventFilters = {
  cameraId?: string;
  eventType?: EventType | "";
  dateFrom?: string;
  dateTo?: string;
};

export function listEvents(token: string, filters: EventFilters): Promise<EventRecord[]> {
  const params = new URLSearchParams();
  if (filters.cameraId) {
    params.set("camera_id", filters.cameraId);
  }
  if (filters.eventType) {
    params.set("event_type", filters.eventType);
  }
  if (filters.dateFrom) {
    params.set("date_from", new Date(filters.dateFrom).toISOString());
  }
  if (filters.dateTo) {
    params.set("date_to", new Date(filters.dateTo).toISOString());
  }

  const suffix = params.toString() ? `?${params}` : "";
  return apiFetch<EventRecord[]>(`/events${suffix}`, { token });
}

export function getSnapshotMetadata(token: string, eventId: string): Promise<SnapshotMetadata> {
  return apiFetch<SnapshotMetadata>(`/events/${eventId}/snapshot`, { token });
}

export function listPersons(token: string): Promise<Person[]> {
  return apiFetch<Person[]>("/persons", { token });
}

export function createPerson(token: string, payload: PersonPayload): Promise<Person> {
  return apiFetch<Person>("/persons", {
    token,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadPersonPhoto(token: string, personId: string, file: File): Promise<PersonPhoto> {
  const body = new FormData();
  body.set("file", file);
  return apiFetch<PersonPhoto>(`/persons/${personId}/photos`, {
    token,
    method: "POST",
    body,
  });
}

export function registerPersonEmbedding(
  token: string,
  personId: string,
  payload: PersonEmbeddingPayload,
): Promise<PersonEmbeddingRecord> {
  return apiFetch<PersonEmbeddingRecord>(`/persons/${personId}/embeddings`, {
    token,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePersonEmbeddings(token: string, personId: string): Promise<unknown> {
  return apiFetch<unknown>(`/persons/${personId}/embeddings`, {
    token,
    method: "DELETE",
  });
}

export function getEmbeddingStatus(token: string): Promise<unknown> {
  return apiFetch<unknown>("/persons/embeddings/status", { token });
}

export function listModels(token: string): Promise<ModelVersion[]> {
  return apiFetch<ModelVersion[]>("/models", { token });
}

export function getModelQuality(token: string): Promise<QualityAnalysis> {
  return apiFetch<QualityAnalysis>("/models/quality", { token });
}

export function getSettings(token: string): Promise<Settings> {
  return apiFetch<Settings>("/settings", { token });
}

export function updateSettings(token: string, payload: Partial<Settings>): Promise<Settings> {
  return apiFetch<Settings>("/settings", {
    token,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getAiHealth(): Promise<unknown> {
  return aiFetch<unknown>("/health");
}

export function getAiVectorStatus(): Promise<unknown> {
  return aiFetch<unknown>("/vector/status");
}

export function detectWebcamOnce(maxAttempts = 10): Promise<WebcamDetection> {
  return aiFetch<WebcamDetection>(`/webcam/detect-once?max_attempts=${maxAttempts}`);
}

export function detectWebcamFrame(frame: Blob): Promise<WebcamDetection> {
  const body = new FormData();
  body.set("file", frame, "webcam-frame.jpg");
  return aiFetch<WebcamDetection>("/webcam/detect-frame", {
    method: "POST",
    body,
  });
}

export class WebcamDetectionSocket {
  private readonly socket: WebSocket;
  private readonly readyPromise: Promise<void>;
  private pending: { resolve: (value: WebcamDetection) => void; reject: (reason: unknown) => void } | null = null;

  constructor() {
    const baseUrl = (import.meta.env.VITE_AI_BASE_URL ?? "/ai").replace(/\/$/, "");
    const url = new URL(`${baseUrl}/webcam/stream`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Не удалось открыть realtime-соединение AI")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      if (!this.pending) {
        return;
      }

      try {
        const payload = JSON.parse(String(event.data)) as WebcamDetection | { error?: string };
        if ("error" in payload && payload.error) {
          this.pending.reject(new Error(payload.error));
        } else {
          this.pending.resolve(payload as WebcamDetection);
        }
      } catch (error) {
        this.pending.reject(error);
      } finally {
        this.pending = null;
      }
    });
    this.socket.addEventListener("close", () => {
      this.pending?.reject(new Error("Realtime-соединение AI закрыто"));
      this.pending = null;
    });
  }

  async sendFrame(frame: Blob): Promise<WebcamDetection> {
    await this.readyPromise;
    if (this.pending) {
      throw new Error("Предыдущий realtime-кадр еще обрабатывается");
    }

    return new Promise<WebcamDetection>((resolve, reject) => {
      this.pending = { resolve, reject };
      this.socket.send(frame);
    });
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  close(): void {
    this.socket.close();
  }
}
