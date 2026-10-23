import { FormEvent, useEffect, useState } from "react";
import { BarChart3, Database, Save, Settings } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { ModelVersion, QualityAnalysis, Role, Settings as SettingsRecord } from "../types";
import { canWrite, formatDateTime } from "../utils/format";

type SettingsPageProps = {
  role: Role;
  settings: SettingsRecord | null;
  models: ModelVersion[];
  quality: QualityAnalysis | null;
  vectorStatus: unknown;
  embeddingStatus: unknown;
  onUpdate: (payload: Partial<SettingsRecord>) => Promise<void>;
};

function prettyJson(payload: unknown): string {
  return JSON.stringify(payload ?? { status: "unavailable" }, null, 2);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "ожидает данных";
  }
  return String(value);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ready: "готово",
    needs_data: "нужны данные",
    available: "доступно",
    unavailable: "недоступно",
  };
  return labels[status] ?? status;
}

export function SettingsPage({
  role,
  settings,
  models,
  quality,
  vectorStatus,
  embeddingStatus,
  onUpdate,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<SettingsRecord>(
    settings ?? {
      processing_fps: 5,
      person_confidence_threshold: 0.65,
      face_recognition_threshold: 0.65,
      event_cooldown_seconds: 60,
      retention_days: 30,
    },
  );
  const writable = canWrite(role);

  useEffect(() => {
    if (settings) {
      setDraft(settings);
    }
  }, [settings]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdate(draft);
  }

  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <h2>Настройки</h2>
          <p>Управляйте порогами, хранением данных и runtime metadata локального демо.</p>
        </div>
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Качество</h2>
            <span>Анализ алгоритмов DBSCAN и K-Means</span>
          </div>
          <BarChart3 aria-hidden="true" />
        </div>
        {quality?.algorithms.length ? (
          <div className="quality-grid">
            {quality.algorithms.map((algorithm) => (
              <section className="quality-card" key={algorithm.algorithm}>
                <div className="quality-card__header">
                  <div>
                    <h3>{algorithm.algorithm}</h3>
                    <span>активных samples: {algorithm.samples}</span>
                  </div>
                  <StatusBadge tone={algorithm.status === "ready" ? "good" : "warn"}>
                    {statusLabel(algorithm.status)}
                  </StatusBadge>
                </div>

                <div className="quality-facts">
                  {Object.entries(algorithm.parameters).map(([key, value]) => (
                    <span key={key}>
                      <strong>{key}</strong>
                      {formatValue(value)}
                    </span>
                  ))}
                  {Object.entries(algorithm.metrics).map(([key, value]) => (
                    <span key={key}>
                      <strong>{key}</strong>
                      {formatValue(value)}
                    </span>
                  ))}
                </div>

                <div className="quality-copy">
                  {algorithm.analysis.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>

                <ul className="quality-list">
                  {algorithm.recommendations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState title="Анализа качества пока нет" body="Данные появятся после ответа backend." />
        )}
      </article>

      <div className="content-grid content-grid--balanced">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Пороги</h2>
              <span>{writable ? "Можно редактировать" : "Режим просмотра"}</span>
            </div>
            <Settings aria-hidden="true" />
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              FPS обработки
              <input
                min={1}
                max={30}
                type="number"
                value={draft.processing_fps}
                disabled={!writable}
                onChange={(event) => setDraft({ ...draft, processing_fps: Number(event.target.value) })}
              />
            </label>
            <label>
              Уверенность детекции человека
              <input
                min={0}
                max={1}
                step={0.01}
                type="number"
                value={draft.person_confidence_threshold}
                disabled={!writable}
                onChange={(event) =>
                  setDraft({ ...draft, person_confidence_threshold: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Порог распознавания лица
              <input
                min={0}
                max={1}
                step={0.01}
                type="number"
                value={draft.face_recognition_threshold}
                disabled={!writable}
                onChange={(event) => setDraft({ ...draft, face_recognition_threshold: Number(event.target.value) })}
              />
            </label>
            <label>
              Cooldown события, секунд
              <input
                min={0}
                type="number"
                value={draft.event_cooldown_seconds}
                disabled={!writable}
                onChange={(event) => setDraft({ ...draft, event_cooldown_seconds: Number(event.target.value) })}
              />
            </label>
            <label>
              Хранение, дней
              <input
                min={1}
                type="number"
                value={draft.retention_days}
                disabled={!writable}
                onChange={(event) => setDraft({ ...draft, retention_days: Number(event.target.value) })}
              />
            </label>
            {writable ? (
              <button className="primary-button" type="submit">
                <Save aria-hidden="true" />
                Сохранить настройки
              </button>
            ) : null}
          </form>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Векторная база</h2>
              <span>Состояние Qdrant и metadata коллекции</span>
            </div>
            <Database aria-hidden="true" />
          </div>
          <div className="status-json">
            <StatusBadge tone="neutral">AI-service vector</StatusBadge>
            <pre>{prettyJson(vectorStatus)}</pre>
            <StatusBadge tone="neutral">Backend vector</StatusBadge>
            <pre>{prettyJson(embeddingStatus)}</pre>
          </div>
        </article>
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Модели</h2>
            <span>зарегистрировано версий: {models.length}</span>
          </div>
        </div>
        {models.length ? (
          <div className="events-table" role="table" aria-label="Модели">
            <div className="events-row events-head models-row" role="row">
              <span>Название</span>
              <span>Runtime</span>
              <span>Версия</span>
              <span>Активна</span>
              <span>Создана</span>
            </div>
            {models.map((model) => (
              <div className="events-row models-row" key={model.model_id} role="row">
                <span>{model.name}</span>
                <span>{model.runtime}</span>
                <span>{model.version}</span>
                <span>{model.active ? "Да" : "Нет"}</span>
                <span>{formatDateTime(model.created_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Моделей пока нет" body="Реестр моделей обновляется после обучения или экспорта." />
        )}
      </article>
    </section>
  );
}
