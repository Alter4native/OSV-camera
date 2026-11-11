import { FormEvent, useState } from "react";
import { Camera, Plus } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { Camera as CameraRecord, CameraPayload, Role } from "../types";
import { canWrite, formatDateTime, stateLabel } from "../utils/format";

type CamerasPageProps = {
  cameras: CameraRecord[];
  role: Role;
  onCreate: (payload: CameraPayload) => Promise<void>;
  onUpdate: (cameraId: string, payload: Partial<CameraPayload>) => Promise<void>;
};

const defaultCamera: CameraPayload = {
  name: "Локальная камера",
  source_type: "webcam",
  source_uri: "0",
  enabled: true,
  processing_fps: 5,
};

function toneForState(state: CameraRecord["state"]) {
  if (state === "online") return "good";
  if (state === "offline" || state === "error") return "danger";
  return "neutral";
}

export function CamerasPage({ cameras, role, onCreate, onUpdate }: CamerasPageProps) {
  const [draft, setDraft] = useState<CameraPayload>(defaultCamera);
  const writable = canWrite(role);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate(draft);
  }

  return (
    <section className="page-stack">
      <div className="camera-grid">
        <article className="panel camera-list-panel">
          <div className="panel-header">
            <div>
              <h2>Подключенные источники</h2>
              <span>{cameras.length} источник(ов)</span>
            </div>
            <Camera aria-hidden="true" />
          </div>

          {cameras.length ? (
            <div className="camera-list">
              {cameras.map((camera) => (
                <div className="camera-card" key={camera.camera_id}>
                  <div className="camera-card__preview">
                    <span className={`camera-card__signal camera-card__signal--${camera.state}`} />
                    <Camera aria-hidden="true" />
                    <span>{camera.state === "online" ? "Сигнал получен" : "Нет сигнала"}</span>
                  </div>
                  <div className="camera-card__main">
                    <div>
                      <h3>{camera.name}</h3>
                      <p>
                        {camera.source_type.toUpperCase()} - {camera.source_uri}
                      </p>
                    </div>
                    <div className="camera-card__health">
                      <span><i /> Стабильность источника</span>
                      <strong>{camera.state === "online" ? "98%" : "—"}</strong>
                    </div>
                    <StatusBadge tone={toneForState(camera.state)}>{stateLabel(camera.state)}</StatusBadge>
                  </div>
                  <div className="definition-list definition-list--inline">
                    <div>
                      <span>FPS</span>
                      <strong>{camera.processing_fps}</strong>
                    </div>
                    <div>
                      <span>Включена</span>
                      <strong>{camera.enabled ? "Да" : "Нет"}</strong>
                    </div>
                    <div>
                      <span>Последний кадр</span>
                      <strong>{formatDateTime(camera.last_frame_at)}</strong>
                    </div>
                  </div>

                  {camera.last_error ? <p className="form-error">{camera.last_error}</p> : null}

                  {writable ? (
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onUpdate(camera.camera_id, { enabled: !camera.enabled })}
                      >
                        {camera.enabled ? "Отключить" : "Включить"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onUpdate(camera.camera_id, { processing_fps: Math.max(1, camera.processing_fps - 1) })}
                      >
                        FPS -
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onUpdate(camera.camera_id, { processing_fps: camera.processing_fps + 1 })}
                      >
                        FPS +
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Камеры не настроены" body="Добавьте веб-камеру или RTSP-источник, чтобы запустить обработку." />
          )}
        </article>

        {writable ? (
          <article className="panel">
            <div className="panel-header">
              <div>
                <h2>Добавить камеру</h2>
                <span>Для демо достаточно одной веб-камеры</span>
              </div>
              <Plus aria-hidden="true" />
            </div>
            <form className="form-grid" onSubmit={handleCreate}>
              <label>
                Название
                <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </label>
              <label>
                Тип источника
                <select
                  value={draft.source_type}
                  onChange={(event) => setDraft({ ...draft, source_type: event.target.value })}
                >
                  <option value="webcam">Веб-камера</option>
                  <option value="rtsp">RTSP</option>
                </select>
              </label>
              <label>
                URI источника
                <input
                  value={draft.source_uri}
                  onChange={(event) => setDraft({ ...draft, source_uri: event.target.value })}
                  placeholder="0 или rtsp://user:pass@ip:554/path"
                />
              </label>
              <label>
                FPS обработки
                <input
                  min={1}
                  max={30}
                  type="number"
                  value={draft.processing_fps}
                  onChange={(event) => setDraft({ ...draft, processing_fps: Number(event.target.value) })}
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                />
                Включена
              </label>
              <button className="primary-button" type="submit">
                <Plus aria-hidden="true" />
                Добавить камеру
              </button>
            </form>
          </article>
        ) : null}
      </div>
    </section>
  );
}
