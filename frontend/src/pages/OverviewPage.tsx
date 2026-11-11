import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Camera,
  Crosshair,
  Gauge,
  Maximize2,
  Minimize2,
  Play,
  ScanLine,
  Server,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";

import { WebcamDetectionSocket } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { MetricTile } from "../components/MetricTile";
import { StatusBadge } from "../components/StatusBadge";
import { TelemetryPanel } from "../components/TelemetryPanel";
import type {
  Camera as CameraRecord,
  EventRecord,
  InferenceTelemetry,
  ModelVersion,
  Person,
  Settings,
  WebcamDetection,
} from "../types";
import { eventTypeLabel, formatDateTime, formatPercent, stateLabel } from "../utils/format";

const TRACKING_INTERVAL_MS = 0;
const SCAN_SAVE_INTERVAL_MS = 1000;
const MAX_DETECTION_WIDTH = 1920;
const JPEG_QUALITY = 0.9;

function createScanSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

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
  onDetectWebcam: (frame: Blob, refreshDashboard?: boolean) => Promise<WebcamDetection | null>;
  onSaveScanSample: (sessionId: string, frame: Blob, detection: WebcamDetection) => Promise<number>;
  onRealtimeDetection: (detection: WebcamDetection) => void;
  onClearDetection: () => void;
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

function readInferenceTelemetry(payload: unknown): InferenceTelemetry | null {
  if (!payload || typeof payload !== "object" || !("telemetry" in payload)) {
    return null;
  }
  const telemetry = (payload as { telemetry: unknown }).telemetry;
  if (!telemetry || typeof telemetry !== "object" || !("processing_fps" in telemetry)) {
    return null;
  }
  return telemetry as InferenceTelemetry;
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
  onSaveScanSample,
  onRealtimeDetection,
  onClearDetection,
}: OverviewPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackingTimeoutRef = useRef<number | null>(null);
  const trackingActiveRef = useRef(false);
  const trackingInFlightRef = useRef(false);
  const trackingRunIdRef = useRef(0);
  const trackingSocketRef = useRef<WebcamDetectionSocket | null>(null);
  const scanSessionIdRef = useRef<string | null>(null);
  const lastScanSaveAtRef = useRef(Number.NEGATIVE_INFINITY);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSessionId, setScanSessionId] = useState<string | null>(null);
  const [savedScanSamples, setSavedScanSamples] = useState(0);
  const [scanSaveError, setScanSaveError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16 / 9");
  const [portraitCamera, setPortraitCamera] = useState(false);
  const [telemetryHistory, setTelemetryHistory] = useState<InferenceTelemetry[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("osvpc-detection-sound") !== "off");
  const [demoMode, setDemoMode] = useState(false);
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousPersonCountRef = useRef(0);
  const lastToneAtRef = useRef(0);
  const primaryCamera = cameras[0] ?? null;
  const activeModel = models.find((model) => model.active) ?? models[0] ?? null;
  const peopleCountEvent = events.find((event) => event.event_type === "people_count");
  const peopleNow = Number(peopleCountEvent?.metadata.people_count ?? peopleCountEvent?.metadata.count ?? 0);
  const selectedCamera = cameraDevices.find((device) => device.deviceId === selectedDeviceId);
  const displayedCameraState = cameraReady ? "online" : primaryCamera?.state ?? "stopped";
  const displayedCameraName = cameraReady
    ? selectedCamera?.label || "Веб-камера браузера"
    : primaryCamera?.name ?? "Источник не настроен";
  const frame = detection?.frame;
  const displayedTelemetry = detection?.telemetry ?? readInferenceTelemetry(aiHealth);
  const [displayDetections, setDisplayDetections] = useState<
    Array<WebcamDetection["detections"][number] & { track_id?: number; hits?: number }>
  >([]);
  const frameQuality = frame
    ? frame.width >= 1280 && frame.height >= 720
      ? "Высокое"
      : frame.width >= 960
        ? "Хорошее"
        : "Низкое"
    : "Ожидание";

  useEffect(() => {
    if (!detection) {
      return;
    }
    setDisplayDetections(detection.tracks ?? detection.detections);

    const telemetry = detection.telemetry;
    if (!telemetry || telemetry.frames_processed <= 0) {
      return;
    }
    setTelemetryHistory((current) => {
      if (current.at(-1)?.frames_processed === telemetry.frames_processed) {
        return current;
      }
      return [...current, telemetry].slice(-36);
    });
  }, [detection]);

  useEffect(() => {
    if (!detection || !soundEnabled || detection.person_count <= 0) return;
    const now = performance.now();
    const personAppeared = previousPersonCountRef.current === 0 || detection.person_count > previousPersonCountRef.current;
    previousPersonCountRef.current = detection.person_count;
    if (!personAppeared || now - lastToneAtRef.current < 1800) return;
    lastToneAtRef.current = now;
    const context = audioContextRef.current;
    if (!context || context.state !== "running") return;
    const start = context.currentTime;
    [740, 988].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.035, start + index * 0.1 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.1 + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + index * 0.1);
      oscillator.stop(start + index * 0.1 + 0.24);
    });
  }, [detection, soundEnabled]);

  useEffect(() => {
    void loadCameraDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", loadCameraDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", loadCameraDevices);
      trackingActiveRef.current = false;
      trackingRunIdRef.current += 1;
      scanSessionIdRef.current = null;
      trackingSocketRef.current?.close();
      trackingSocketRef.current = null;
      if (trackingTimeoutRef.current !== null) {
        window.clearTimeout(trackingTimeoutRef.current);
      }
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
      trackingActiveRef.current = false;
      trackingRunIdRef.current += 1;
      if (trackingTimeoutRef.current !== null) {
        window.clearTimeout(trackingTimeoutRef.current);
        trackingTimeoutRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setDisplayDetections([]);
      setTelemetryHistory([]);
      const video: MediaTrackConstraints = selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, min: 15 },
          }
        : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, min: 15 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current ??= new AudioContextClass();
        await audioContextRef.current.resume();
      }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", handleBrowserCameraEnded, { once: true });
      });
      const activeTrack = stream.getVideoTracks()[0];
      if (activeTrack?.applyConstraints) {
        await activeTrack.applyConstraints({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, min: 15 },
        });
      }

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

  function toggleDetectionSound() {
    setSoundEnabled((enabled) => {
      const next = !enabled;
      localStorage.setItem("osvpc-detection-sound", next ? "on" : "off");
      if (!next) {
        previousPersonCountRef.current = 0;
      }
      return next;
    });
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
      return;
    }
    await document.documentElement.requestFullscreen();
    setFullscreen(true);
  }

  function stopBrowserCamera() {
    trackingActiveRef.current = false;
    trackingRunIdRef.current += 1;
    scanSessionIdRef.current = null;
    trackingSocketRef.current?.close();
    trackingSocketRef.current = null;
    if (trackingTimeoutRef.current !== null) {
      window.clearTimeout(trackingTimeoutRef.current);
      trackingTimeoutRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setDisplayDetections([]);
    onClearDetection();
    setCameraReady(false);
    setCameraError(null);
  }

  function handleBrowserCameraEnded() {
    trackingActiveRef.current = false;
    trackingRunIdRef.current += 1;
    scanSessionIdRef.current = null;
    trackingSocketRef.current?.close();
    trackingSocketRef.current = null;
    if (trackingTimeoutRef.current !== null) {
      window.clearTimeout(trackingTimeoutRef.current);
      trackingTimeoutRef.current = null;
    }
    streamRef.current = null;
    setDisplayDetections([]);
    onClearDetection();
    setCameraReady(false);
    setCameraError("Веб-камера отключена.");
  }

  async function captureBrowserFrame(): Promise<Blob | null> {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) {
      setCameraError("Сначала включите веб-камеру.");
      return null;
    }

    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const scale = Math.min(1, MAX_DETECTION_WIDTH / sourceWidth);
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Canvas недоступен для захвата кадра.");
      return null;
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) {
      setCameraError("Не удалось подготовить кадр для детекции.");
      return null;
    }

    return blob;
  }

  async function runTrackingFrame() {
    const socket = trackingSocketRef.current;
    const runId = trackingRunIdRef.current;
    if (!trackingActiveRef.current || trackingInFlightRef.current) {
      return;
    }

    trackingInFlightRef.current = true;
    try {
      const blob = await captureBrowserFrame();
      if (blob && trackingActiveRef.current) {
        if (socket) {
          try {
            const result = await socket.sendFrame(blob);
            if (trackingActiveRef.current && runId === trackingRunIdRef.current) {
              onRealtimeDetection(result);
              await saveScanSampleIfDue(blob, result);
            }
          } catch {
            socket.close();
            if (trackingSocketRef.current === socket) {
              trackingSocketRef.current = null;
            }
            if (trackingActiveRef.current && runId === trackingRunIdRef.current) {
              const result = await onDetectWebcam(blob, false);
              if (result && trackingActiveRef.current && runId === trackingRunIdRef.current) {
                await saveScanSampleIfDue(blob, result);
              }
            }
          }
        } else {
          if (trackingActiveRef.current && runId === trackingRunIdRef.current) {
            const result = await onDetectWebcam(blob, false);
            if (result && trackingActiveRef.current && runId === trackingRunIdRef.current) {
              await saveScanSampleIfDue(blob, result);
            }
          }
        }
      }
    } finally {
      trackingInFlightRef.current = false;
      if (trackingActiveRef.current) {
        trackingTimeoutRef.current = window.setTimeout(() => void runTrackingFrame(), TRACKING_INTERVAL_MS);
      }
    }
  }

  async function detectBrowserFrame() {
    const blob = await captureBrowserFrame();
    if (!blob) {
      return;
    }

    trackingRunIdRef.current += 1;
    trackingSocketRef.current?.close();
    trackingSocketRef.current = null;
    if (trackingTimeoutRef.current !== null) {
      window.clearTimeout(trackingTimeoutRef.current);
      trackingTimeoutRef.current = null;
    }
    const sessionId = createScanSessionId();
    scanSessionIdRef.current = sessionId;
    lastScanSaveAtRef.current = Number.NEGATIVE_INFINITY;
    setScanSessionId(sessionId);
    setSavedScanSamples(0);
    setScanSaveError(null);
    trackingActiveRef.current = true;
    const firstDetection = await onDetectWebcam(blob);
    if (firstDetection) await saveScanSampleIfDue(blob, firstDetection, true);

    try {
      const socket = new WebcamDetectionSocket();
      trackingSocketRef.current = socket;
      await socket.ready();
    } catch (error) {
      trackingSocketRef.current?.close();
      trackingSocketRef.current = null;
      setCameraError(null);
    }
    void runTrackingFrame();
  }

  async function saveScanSampleIfDue(frameBlob: Blob, result: WebcamDetection, force = false) {
    const sessionId = scanSessionIdRef.current;
    const now = performance.now();
    if (!sessionId || (!force && now - lastScanSaveAtRef.current < SCAN_SAVE_INTERVAL_MS)) return;
    lastScanSaveAtRef.current = now;
    try {
      const sampleCount = await onSaveScanSample(sessionId, frameBlob, result);
      setSavedScanSamples(sampleCount);
      setScanSaveError(null);
    } catch (error) {
      setScanSaveError(error instanceof Error ? error.message : "Не удалось сохранить замер.");
    }
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
      <section className={`dashboard-hero ${demoMode ? "dashboard-hero--demo" : ""}`}>
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
          <button
            className={`secondary-button hero-secondary ${cameraReady ? "hero-secondary--active" : ""}`}
            type="button"
            onClick={cameraReady ? stopBrowserCamera : startBrowserCamera}
            disabled={loading}
          >
            <Video aria-hidden="true" />
            {cameraReady ? "Отключить веб-камеру" : "Включить веб-камеру"}
          </button>
          <button className="primary-button hero-action" type="button" onClick={detectBrowserFrame} disabled={loading || !cameraReady}>
            <Play aria-hidden="true" />
            {loading ? "Анализ..." : "Детектировать кадр"}
          </button>
          <button className="sound-toggle" type="button" onClick={toggleDetectionSound} aria-pressed={soundEnabled}>
            {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            <span>{soundEnabled ? "Звук включён" : "Звук выключен"}</span>
          </button>
          <button className={`demo-toggle ${demoMode ? "is-active" : ""}`} type="button" onClick={() => setDemoMode((value) => !value)} aria-pressed={demoMode}>
            <Sparkles aria-hidden="true" />
            <span>{demoMode ? "Demo mode включён" : "Demo mode"}</span>
          </button>
          <button className="icon-button hero-fullscreen" type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}>
            {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        </div>
      </section>

      {cameraError ? <div className="notice-banner">{cameraError}</div> : null}

      <section className="content-grid dashboard-grid dashboard-grid--camera">
        <article className="panel live-panel">
          <div className="panel-header">
            <div>
              <h2>Кадр веб-камеры</h2>
              <span>{detection ? `Кадр #${detection.frame_sequence} - ${formatDateTime(detection.timestamp)}` : "Ожидает запуска детекта"}</span>
            </div>
            <div className="panel-header__actions">
              <span className="quality-pill"><ScanLine size={14} /> Качество: {frameQuality}</span>
              <StatusBadge tone={detection ? "good" : "neutral"}>{detection ? "готово" : "ожидание"}</StatusBadge>
            </div>
          </div>
          {scanSessionId ? (
            <div className="scan-storage-status" role="status">
              <strong>Замеры сохранены: {savedScanSamples}</strong>
              <span>Кадр и результат детекции — не чаще 1 раза в секунду</span>
              <code>storage/scans/{scanSessionId}/</code>
              {scanSaveError ? <span className="scan-storage-status__error">Ошибка сохранения: {scanSaveError}</span> : null}
            </div>
          ) : null}
          <div
            className={`video-frame detection-frame ${portraitCamera ? "detection-frame--portrait" : ""}`}
            style={{ aspectRatio: frameAspectRatio }}
            aria-label="Результат детекции с веб-камеры"
          >
            <video className="detection-video" ref={videoRef} muted playsInline onLoadedMetadata={updateVideoAspectRatio} onResize={updateVideoAspectRatio} />
            {detection?.frame_image ? <img className="detection-image" src={detection.frame_image} alt="" /> : null}
            {heatmapEnabled ? <div className="heatmap-overlay" aria-label="Тепловая карта активности" /> : null}
            <canvas ref={canvasRef} hidden />
            {frame ? (
              <span className="frame-size">
                {frame.width} x {frame.height}
              </span>
            ) : null}
            {displayDetections.map((item, index) => {
              const width = frame?.width || 1;
              const height = frame?.height || 1;
              return (
                <div
                  className="person-box detection-box"
                  key={item.track_id != null ? `track-${item.track_id}` : `detection-${index}`}
                  style={{
                    left: `${(item.bbox.x1 / width) * 100}%`,
                    top: `${(item.bbox.y1 / height) * 100}%`,
                    width: `${(item.bbox.width / width) * 100}%`,
                    height: `${(item.bbox.height / height) * 100}%`,
                  }}
                >
                  <span className="detection-box__label">
                    <span className="detection-box__index">#{String(item.track_id ?? index + 1).padStart(2, "0")}</span>
                    <span className="detection-box__class">{classLabel(item.class_name)}</span>
                    <span className="detection-box__confidence">{formatPercent(item.confidence)}</span>
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
          <div className="live-panel__toolbar">
            <span><i className="live-indicator" /> {cameraReady ? "Поток в реальном времени" : "Поток не запущен"}</span>
            <button className={`text-button ${heatmapEnabled ? "is-selected" : ""}`} type="button" onClick={() => setHeatmapEnabled((value) => !value)}>
              <Activity size={15} /> {heatmapEnabled ? "Скрыть heatmap" : "Показать heatmap"}
            </button>
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

      <section className="status-grid" aria-label="Статус платформы">
        <MetricTile
          icon={Camera}
          label={cameraReady ? "Веб-камера" : "Камера"}
          value={stateLabel(displayedCameraState)}
          detail={displayedCameraName}
        />
        <MetricTile icon={Crosshair} label="Последний детект" value={String(detection?.person_count ?? 0)} detail="людей в кадре" />
        <MetricTile
          icon={Gauge}
          label="AI · FPS"
          value={displayedTelemetry ? displayedTelemetry.processing_fps.toFixed(1) : "—"}
          detail={`цель ${settings?.processing_fps ?? primaryCamera?.processing_fps ?? 0} кадр/с`}
        />
        <MetricTile icon={Activity} label="AI-сервис" value={readStatus(aiHealth)} detail={readDetectorRuntime(aiHealth)} />
      </section>

      <TelemetryPanel
        telemetry={displayedTelemetry}
        history={telemetryHistory}
        visibleTracks={detection?.tracking?.visible_tracks ?? detection?.tracks?.length ?? detection?.person_count ?? 0}
        cameraActive={cameraReady}
      />

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
