import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Camera,
  ChevronDown,
  Crosshair,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ScanLine,
  Video,
} from "lucide-react";

import { WebcamDetectionSocket } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { TelemetryPanel } from "../components/TelemetryPanel";
import type { InferenceTelemetry, WebcamDetection } from "../types";
import { formatDateTime, formatPercent, stateLabel } from "../utils/format";

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
  aiHealth: unknown;
  detection: WebcamDetection | null;
  loading: boolean;
  onDetectWebcam: (frame: Blob, refreshDashboard?: boolean) => Promise<WebcamDetection | null>;
  onSaveScanSample: (sessionId: string, frame: Blob, detection: WebcamDetection) => Promise<number>;
  onRealtimeDetection: (detection: WebcamDetection) => void;
  onClearDetection: () => void;
};

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
  aiHealth,
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
  const [trackingActive, setTrackingActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const selectedCamera = cameraDevices.find((device) => device.deviceId === selectedDeviceId);
  const displayedCameraState = cameraReady ? "online" : "stopped";
  const displayedCameraName = selectedCamera?.label || "Камера браузера";
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
      setTrackingActive(false);
      const video: MediaTrackConstraints = selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, min: 15 },
          }
        : { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, min: 15 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
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
    setTrackingActive(false);
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
    setTrackingActive(false);
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
    setTrackingActive(true);
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

  function stopDetection() {
    trackingActiveRef.current = false;
    trackingRunIdRef.current += 1;
    scanSessionIdRef.current = null;
    trackingSocketRef.current?.close();
    trackingSocketRef.current = null;
    if (trackingTimeoutRef.current !== null) {
      window.clearTimeout(trackingTimeoutRef.current);
      trackingTimeoutRef.current = null;
    }
    setTrackingActive(false);
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
    <section className="page-stack overview-stack">
      {cameraError ? <div className="notice-banner">{cameraError}</div> : null}

      <article className="panel live-panel">
        <div className="panel-header console-header">
          <div>
            <h2>Веб-камера</h2>
            <span>{detection ? `Кадр #${detection.frame_sequence} · ${formatDateTime(detection.timestamp)}` : displayedCameraName}</span>
          </div>
          <div className="panel-header__actions">
            {frame ? <span className="quality-pill"><ScanLine size={14} /> Качество: {frameQuality}</span> : null}
            <StatusBadge tone={trackingActive ? "good" : cameraReady ? "warn" : "neutral"}>
              {trackingActive ? "анализ идёт" : cameraReady ? "камера включена" : stateLabel(displayedCameraState)}
            </StatusBadge>
          </div>
        </div>

        <div className="live-controls">
          {cameraDevices.length > 1 ? (
            <label className="camera-picker camera-picker--console">
              <span>Источник</span>
              <select value={selectedDeviceId} onChange={(event) => setSelectedDeviceId(event.target.value)} disabled={loading || cameraReady}>
                {cameraDevices.map((device, index) => (
                  <option value={device.deviceId} key={device.deviceId || index}>
                    {device.label || `Камера ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="camera-source"><Camera aria-hidden="true" /><span>{selectedCamera?.label || "Камера браузера"}</span></div>
          )}

          <div className="live-controls__buttons">
            <button
              className={`secondary-button camera-toggle ${cameraReady ? "is-connected" : ""}`}
              type="button"
              onClick={cameraReady ? stopBrowserCamera : startBrowserCamera}
              disabled={loading}
            >
              <Video aria-hidden="true" />
              {cameraReady ? "Отключить камеру" : "Включить камеру"}
            </button>
            <button
              className={`primary-button tracking-toggle ${trackingActive ? "is-running" : ""}`}
              type="button"
              onClick={trackingActive ? stopDetection : () => void detectBrowserFrame()}
              disabled={loading || !cameraReady}
            >
              {trackingActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {loading ? "Запускаем..." : trackingActive ? "Остановить анализ" : "Начать анализ"}
            </button>
            <button
              className="icon-button fullscreen-toggle"
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={fullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
              title={fullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
            >
              {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </button>
          </div>

          <div className="detection-count" aria-live="polite" aria-atomic="true">
            <span>Людей в кадре</span>
            <strong>{detection?.person_count ?? 0}</strong>
          </div>
        </div>

        {scanSessionId ? (
          <div className="scan-storage-status" role="status">
            <strong>{trackingActive ? "Идёт запись замеров" : "Замеры сохранены"}: {savedScanSamples}</strong>
            <span>Кадры и результаты анализа сохраняются автоматически во время запуска.</span>
            <code>storage/scans/{scanSessionId}/</code>
            {scanSaveError ? <span className="scan-storage-status__error">Ошибка сохранения: {scanSaveError}</span> : null}
          </div>
        ) : null}

        <div
          className={`video-frame detection-frame ${portraitCamera ? "detection-frame--portrait" : ""}`}
          style={{ aspectRatio: frameAspectRatio }}
          aria-label="Изображение с веб-камеры и рамки обнаруженных людей"
          role="img"
        >
          <video className="detection-video" ref={videoRef} muted playsInline onLoadedMetadata={updateVideoAspectRatio} onResize={updateVideoAspectRatio} />
          {detection?.frame_image ? <img className="detection-image" src={detection.frame_image} alt="" /> : null}
          <canvas ref={canvasRef} hidden />
          {frame ? (
            <span className="frame-size">
              {frame.width} × {frame.height}
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
          {!detection && !trackingActive ? (
            <div className="detection-empty">
              <Crosshair aria-hidden="true" />
              <strong>{cameraReady ? "Камера готова к анализу" : "Подключите веб-камеру"}</strong>
              <span>{cameraReady ? "Нажмите «Начать анализ», чтобы отслеживать людей." : "После подключения здесь появится изображение и рамки найденных людей."}</span>
            </div>
          ) : null}
        </div>

      </article>

      <details className="telemetry-disclosure">
        <summary>
          <span><Activity aria-hidden="true" /> Подробная статистика</span>
          <span className="telemetry-disclosure__hint">FPS, задержка, уверенность и качество кадра</span>
          <ChevronDown className="telemetry-disclosure__chevron" aria-hidden="true" />
        </summary>
        <TelemetryPanel
          telemetry={displayedTelemetry}
          history={telemetryHistory}
          visibleTracks={detection?.tracking?.visible_tracks ?? detection?.tracks?.length ?? detection?.person_count ?? 0}
          cameraActive={cameraReady}
          quality={detection?.quality}
          recognition={detection?.recognition}
        />
      </details>
    </section>
  );
}
