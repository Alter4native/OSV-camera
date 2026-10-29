import { Activity, Boxes, Cpu, Gauge, ScanLine, Timer } from "lucide-react";

import type { InferenceTelemetry } from "../types";

type TelemetryPanelProps = {
  telemetry: InferenceTelemetry | null;
  history: InferenceTelemetry[];
  visibleTracks: number;
  cameraActive: boolean;
};

function formatMetric(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 160;
  const height = 42;
  const padding = 3;
  const safeValues = values.filter(Number.isFinite);
  const min = safeValues.length ? Math.min(...safeValues) : 0;
  const max = safeValues.length ? Math.max(...safeValues) : 1;
  const span = Math.max(max - min, 1);
  const points = safeValues
    .map((value, index) => {
      const x = safeValues.length < 2 ? width / 2 : (index / (safeValues.length - 1)) * width;
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="telemetry-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} />
      {safeValues.length > 1 ? <polyline points={points} /> : null}
    </svg>
  );
}

export function TelemetryPanel({ telemetry, history, visibleTracks, cameraActive }: TelemetryPanelProps) {
  const confidence = Math.max(0, Math.min(1, telemetry?.average_confidence ?? 0));
  const hasSamples = Boolean(telemetry?.frames_processed);
  const liveState = cameraActive ? "Поток активен" : hasSamples ? "Последний кадр" : "Ожидание";

  return (
    <section className="telemetry-panel" aria-label="Телеметрия AI-детектора">
      <header className="telemetry-header">
        <div>
          <span className="telemetry-kicker"><Activity size={15} /> AI MONITOR</span>
          <h2>Телеметрия обработки</h2>
          <p>Скорость и качество текущего потока с веб-камеры</p>
        </div>
        <span className={`telemetry-state ${cameraActive ? "is-live" : ""}`}>
          <i aria-hidden="true" /> {liveState}
        </span>
      </header>

      <div className="telemetry-cards">
        <article className="telemetry-card">
          <div className="telemetry-card-title"><Gauge size={16} /><span>Частота анализа</span></div>
          <div className="telemetry-value-row">
            <strong>{formatMetric(telemetry?.processing_fps)}</strong><small>FPS</small>
          </div>
          <Sparkline values={history.map((sample) => sample.processing_fps)} label="График частоты анализа" />
          <span className="telemetry-note">фактически обработано</span>
        </article>

        <article className="telemetry-card">
          <div className="telemetry-card-title"><Timer size={16} /><span>Задержка модели</span></div>
          <div className="telemetry-value-row">
            <strong>{formatMetric(telemetry?.inference_ms)}</strong><small>мс</small>
          </div>
          <Sparkline values={history.map((sample) => sample.inference_ms ?? 0)} label="График задержки inference" />
          <span className="telemetry-note">
            среднее {formatMetric(telemetry?.average_inference_ms)} · p95 {formatMetric(telemetry?.p95_inference_ms)} мс
          </span>
        </article>

        <article className="telemetry-card">
          <div className="telemetry-card-title"><ScanLine size={16} /><span>Уверенность</span></div>
          <div className="telemetry-value-row">
            <strong>{hasSamples ? `${Math.round(confidence * 100)}%` : "—"}</strong>
            <small>{telemetry?.detections_last_frame ?? 0} объектов</small>
          </div>
          <div className="telemetry-progress" role="progressbar" aria-label="Средняя уверенность детекций" aria-valuenow={Math.round(confidence * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${confidence * 100}%` }} />
          </div>
          <span className="telemetry-note">среднее по последнему кадру</span>
        </article>

        <article className="telemetry-card telemetry-card--runtime">
          <div className="telemetry-card-title"><Cpu size={16} /><span>Модель и устройство</span></div>
          <div className="telemetry-runtime-value">{telemetry?.model || "YOLO26n"}</div>
          <div className="telemetry-runtime-badges">
            <span>{telemetry?.device || "ожидание"}</span>
            <span className={telemetry?.loaded ? "is-ready" : ""}>{telemetry?.loaded ? "готова" : "загрузка"}</span>
          </div>
          <span className="telemetry-note">кадр {telemetry?.frame_width || 0} × {telemetry?.frame_height || 0}</span>
        </article>
      </div>

      <footer className="telemetry-footer">
        <div><Boxes size={15} /><span>Треки в кадре</span><strong>{visibleTracks}</strong></div>
        <div><Activity size={15} /><span>Кадров обработано</span><strong>{telemetry?.frames_processed ?? 0}</strong></div>
        <div><Cpu size={15} /><span>Runtime</span><strong>Ultralytics</strong></div>
      </footer>
    </section>
  );
}
