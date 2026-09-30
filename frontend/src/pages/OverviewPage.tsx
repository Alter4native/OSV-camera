import { useEffect, useRef, useState } from "react";
import { Activity, Camera, Crosshair, Gauge, Play, Server, Video } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { MetricTile } from "../components/MetricTile";
import { StatusBadge } from "../components/StatusBadge";
import type {
  Camera as CameraRecord,
  EventRecord,
  ModelVersion,
  Person,
  Settings,
  WebcamDetection,
} from "../types";
import { eventTypeLabel, formatDateTime, formatPercent, stateLabel } from "../utils/format";

type OverviewPageProps = {
  cameras: CameraRecord[];
  events: EventRecord[];
  persons: Person[];
  models: ModelVersion[];
  settings: Settings | null;
  aiHealth: unknown;
  vectorStatus: unknown;
  detection: WebcamDetection | null;
  loading: boolean;
  onDetectWebcam: (frame: Blob) => Promise<void>;
};

function readStatus(payload: unknown): string {
  if (payload && typeof payload === "object" && "status" in payload) {
    return String((payload as { status: unknown }).status);
  }
  return "недоступно";
}

function readDetectorRuntime(payload: unknown): string {
  if (payload && typeof payload === "object" && "detector" in payload) {
    const detector = (payload as { detector: unknown }).detector;
    if (detector && typeof detector === "object" && "runtime" in detector) {
      return String((detector as { runtime: unknown }).runtime);
    }
  }
  return "AI";
}

function classLabel(className: string): string {
  if (className === "person") {
    return "человек";
  }
  return className;
}

export function OverviewPage({
  cameras,
  events,
  persons,
  models,
  settings,
  aiHealth,
  vectorStatus,
  detection,
  loading,
  onDetectWebcam,
}: OverviewPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16 / 9");
  const [portraitCamera, setPortraitCamera] = useState(false);
  const primaryCamera = cameras[0] ?? null;
  const activeModel = models.find((model) => model.active) ?? models[0] ?? null;
  const peopleCountEvent = events.find((event) => event.event_type === "people_count");
  const peopleNow = Number(peopleCountEvent?.metadata.people_count ?? peopleCountEvent?.metadata.count ?? 0);
  const frame = detection?.frame;

  useEffect(() => {
    void loadCameraDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadCameraDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadCameraDevices);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function loadCameraDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === "videoinput");
      setCameraDevices(videoInputs);
      setSelectedDeviceId((current) => current || videoInputs[0]?.deviceId || "");
    } catch {
      setCameraDevices([]);
    }
  }

  async function startBrowserCamera() {
    setCameraError(null);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const video: MediaTrackConstraints = selectedDeviceId
        ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        updateVideoAspectRatio();
      }
      setCameraReady(true);
      await loadCameraDevices();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось открыть веб-камеру";
      setCameraError(message);
      setCameraReady(false);
    }
  }

  async function detectBrowserFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) {
      setCameraError("Сначала включите веб-камеру.");
      return;
    }

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Canvas недоступен для захвата кадра.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setCameraError("Не удалось подготовить кадр для детекции.");
      return;
    }

    await onDetectWebcam(blob);
  }

  function updateVideoAspectRatio() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video?.videoHeight) {
      return;
    }
    const screenIsPortrait = window.matchMedia?.("(orientation: portrait)").matches ?? window.innerHeight > window.innerWidth;
    const sensorLooksLandscape = video.videoWidth > video.videoHeight;
    const shouldUsePortraitRatio = screenIsPortrait && sensorLooksLandscape;
    setPortraitCamera(shouldUsePortraitRatio);
    setVideoAspectRatio(
      shouldUsePortraitRatio ? `${video.videoHeight} / ${video.videoWidth}` : `${video.videoWidth} / ${video.videoHeight}`,
    );
  }

  const frameAspectRatio =
    frame && portraitCamera && frame.width > frame.height ? `${frame.height} / ${frame.width}` : frame ? `${frame.width} / ${frame.height}` : videoAspectRatio;

  return (
    <>
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">OSV-PC live</span>
          <h2>Детекция людей с веб-камеры</h2>
          <p>
            Запустите одиночный анализ кадра: AI-сервис прочитает текущий кадр с локальной камеры, выполнит детекцию и
            вернет найденные области.
          </p>
        </div>
        <div className="hero-actions">
          {cameraDevices.length ? (
            <label className="camera-picker">
              <span>Камера</span>
              <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} disabled={loading || cameraReady}>
                {cameraDevices.map((device, index) => (
                  <option value={device.deviceId} key={device.deviceId || index}>
                    {device.label || `Камера ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="secondary-button hero-secondary" type="button" onClick={startBrowserCamera} disabled={loading}>
            <Video aria-hidden="true" />
            {cameraReady ? "Камера включена" : "Включить веб-камеру"}
          </button>
          <button className="primary-button hero-action" type="button" onClick={detectBrowserFrame} disabled={loading || !cameraReady}>
            <Play aria-hidden="true" />
            {loading ? "Анализ..." : "Детектировать кадр"}
          </button>
        </div>
      </section>

      {cameraError ? <div className="notice-banner">{cameraError}</div> : null}

      <section className="status-grid" aria-label="Статус платформы">
        <MetricTile
          icon={Camera}
          label="Камера"
          value={primaryCamera ? stateLabel(primaryCamera.state) : "Нет камеры"}
          detail={primaryCamera?.name ?? "Источник не настроен"}
        />
        <MetricTile icon={Crosshair} label="Последний детект" value={String(detection?.person_count ?? 0)} detail="людей в кадре" />
        <MetricTile
          icon={Gauge}
          label="FPS обработки"
          value={String(settings?.processing_fps ?? primaryCamera?.processing_fps ?? 0)}
          detail="целевая частота анализа"
        />
        <MetricTile icon={Activity} label="AI-сервис" value={readStatus(aiHealth)} detail={readDetectorRuntime(aiHealth)} />
      </section>

      <section className="content-grid dashboard-grid">
        <article className="panel live-panel">
          <div className="panel-header">
            <div>
              <h2>Кадр веб-камеры</h2>
              <span>{detection ? `Кадр #${detection.frame_sequence} - ${formatDateTime(detection.timestamp)}` : "Ожидает запуска детекта"}</span>
            </div>
            <StatusBadge tone={detection ? "good" : "neutral"}>{detection ? "готово" : "ожидание"}</StatusBadge>
          </div>
          <div
            className={`video-frame detection-frame ${portraitCamera ? "detection-frame--portrait" : ""}`}
            style={{ aspectRatio: frameAspectRatio }}
            aria-label="Результат детекции с веб-камеры"
          >
            <video className="detection-video" ref={videoRef} muted playsInline onLoadedMetadata={updateVideoAspectRatio} onResize={updateVideoAspectRatio} />
            {detection?.frame_image ? <img className="detection-image" src={detection.frame_image} alt="" /> : null}
            <canvas ref={canvasRef} hidden />
            {frame ? (
              <span className="frame-size">
                {frame.width} x {frame.height}
              </span>
            ) : null}
            {detection?.detections.map((item, index) => {
              const width = frame?.width || 1;
              const height = frame?.height || 1;
              return (
                <div
                  className="person-box detection-box"
                  key={`${item.frame_sequence}-${index}`}
                  style={{
                    left: `${(item.bbox.x1 / width) * 100}%`,
                    top: `${(item.bbox.y1 / height) * 100}%`,
                    width: `${(item.bbox.width / width) * 100}%`,
                    height: `${(item.bbox.height / height) * 100}%`,
                  }}
                >
                  <span>
                    #{index + 1} {classLabel(item.class_name)} {formatPercent(item.confidence)}
                  </span>
                </div>
              );
            })}
            {!detection && !cameraReady ? (
              <div className="detection-empty">
                <Crosshair aria-hidden="true" />
                <strong>Нажмите "Запустить детект"</strong>
                <span>Результаты YOLO появятся поверх схемы кадра.</span>
              </div>
            ) : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Сводка распознавания</h2>
              <span>Порог лица {settings?.face_recognition_threshold ?? 0.65}</span>
            </div>
          </div>
          <div className="recognition-list">
            <div>
              <span>Людей сейчас</span>
              <strong>{String(detection?.person_count ?? peopleNow)}</strong>
            </div>
            <div>
              <span>Известные профили</span>
              <strong>{persons.length}</strong>
            </div>
            <div>
              <span>Векторная БД</span>
              <strong>{readStatus(vectorStatus)}</strong>
            </div>
          </div>
        </article>
      </section>

      <section className="content-grid content-grid--balanced">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Последние события</h2>
              <span>Загружено: {events.length}</span>
            </div>
          </div>
          {events.length ? (
            <div className="compact-list">
              {events.slice(0, 5).map((event) => (
                <div className="compact-row" key={event.event_id}>
                  <div>
                    <strong>{eventTypeLabel(event.event_type)}</strong>
                    <span>{formatDateTime(event.timestamp)}</span>
                  </div>
                  <span>{formatPercent(event.confidence)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Событий пока нет" body="Они появятся после публикации детекций AI-сервисом." />
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Модель детекции</h2>
              <span>Активный runtime</span>
            </div>
            <Server aria-hidden="true" />
          </div>
          {activeModel ? (
            <div className="definition-list">
              <div>
                <span>Название</span>
                <strong>{activeModel.name}</strong>
              </div>
              <div>
                <span>Runtime</span>
                <strong>{activeModel.runtime}</strong>
              </div>
              <div>
                <span>Версия</span>
                <strong>{activeModel.version}</strong>
              </div>
            </div>
          ) : (
            <EmptyState title="Модель не зарегистрирована" body="Добавьте модель в registry после обучения или экспорта." />
          )}
        </article>
      </section>
    </>
  );
}
