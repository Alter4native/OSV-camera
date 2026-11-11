import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, Filter, Image } from "lucide-react";

import type { EventFilters } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { StatusBadge } from "../components/StatusBadge";
import type { Camera, EventRecord, EventType, SnapshotMetadata } from "../types";
import { eventTypeLabel, formatDateTime, formatPercent } from "../utils/format";

type EventsPageProps = {
  cameras: Camera[];
  events: EventRecord[];
  filters: EventFilters;
  snapshot: SnapshotMetadata | null;
  onApplyFilters: (filters: EventFilters) => Promise<void>;
  onLoadSnapshot: (eventId: string) => Promise<void>;
};

const eventTypes: EventType[] = [
  "person_detected",
  "known_person_detected",
  "unknown_person_detected",
  "restricted_zone_entry",
  "camera_offline",
  "people_count",
];

function snapshotTone(event: EventRecord) {
  return event.snapshot_url ? "good" : "neutral";
}

export function EventsPage({ cameras, events, filters, snapshot, onApplyFilters, onLoadSnapshot }: EventsPageProps) {
  const [draft, setDraft] = useState<EventFilters>(filters);
  const cameraById = useMemo(() => new Map(cameras.map((camera) => [camera.camera_id, camera.name])), [cameras]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onApplyFilters(draft);
  }

  return (
    <section className="page-stack">
      <div className="section-heading">
        <div>
          <h2>События</h2>
          <p>Фильтруйте детекции людей, статусы камер, входы в зоны и обновления счетчика людей.</p>
        </div>
      </div>

      <article className="panel">
        <form className="filter-bar" onSubmit={handleSubmit}>
          <label>
            Камера
            <select value={draft.cameraId ?? ""} onChange={(event) => setDraft({ ...draft, cameraId: event.target.value })}>
              <option value="">Все камеры</option>
              {cameras.map((camera) => (
                <option key={camera.camera_id} value={camera.camera_id}>
                  {camera.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Тип события
            <select
              value={draft.eventType ?? ""}
              onChange={(event) => setDraft({ ...draft, eventType: event.target.value as EventType | "" })}
            >
              <option value="">Все события</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventTypeLabel(eventType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            С
            <input
              type="datetime-local"
              value={draft.dateFrom ?? ""}
              onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })}
            />
          </label>
          <label>
            По
            <input
              type="datetime-local"
              value={draft.dateTo ?? ""}
              onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })}
            />
          </label>
          <button className="primary-button" type="submit">
            <Filter aria-hidden="true" />
            Применить
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setDraft({});
              void onApplyFilters({});
            }}
          >
            Сбросить
          </button>
        </form>
      </article>

      <article className="panel events-panel">
        <div className="panel-header">
          <div>
            <h2>Лента событий</h2>
            <span>{events.length} событие(й)</span>
          </div>
          <CalendarDays aria-hidden="true" />
        </div>

        {events.length ? (
          <div className="events-table events-timeline" role="table" aria-label="События">
            <div className="events-row events-head" role="row">
              <span>Время</span>
              <span>Тип</span>
              <span>Камера</span>
              <span>Уверенность</span>
              <span>Снимок</span>
              <span>Действие</span>
            </div>
            {events.map((event) => (
              <div className="events-row" role="row" key={event.event_id}>
                <span className="event-time" data-label="Время">{formatDateTime(event.timestamp)}</span>
                <span className="event-type" data-label="Тип"><i className={`event-marker event-marker--${event.event_type}`} />{eventTypeLabel(event.event_type)}</span>
                <span className="event-camera" data-label="Камера">{cameraById.get(event.camera_id) ?? event.camera_id}</span>
                <span className="event-confidence" data-label="Уверенность">{formatPercent(event.confidence)}</span>
                <span data-label="Снимок">
                  <StatusBadge tone={snapshotTone(event)}>{event.snapshot_url ? "закрытый" : "нет"}</StatusBadge>
                </span>
                <span data-label="Действие">
                  <button
                    className="text-button"
                    type="button"
                    disabled={!event.snapshot_url}
                    onClick={() => onLoadSnapshot(event.event_id)}
                  >
                    <Image aria-hidden="true" />
                    Открыть
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Событий не найдено" body="Измените фильтры или запустите AI-сервис для приема детекций." />
        )}
      </article>

      {snapshot ? (
        <article className="panel snapshot-panel">
          <div className="panel-header">
            <div>
              <h2>Авторизованный снимок</h2>
              <span>Снимок доступен через API и не публикуется как открытый static URL.</span>
            </div>
            <StatusBadge tone="good">{snapshot.access}</StatusBadge>
          </div>
          <div className="snapshot-preview">
            <Image aria-hidden="true" />
            <div>
              <span>Ключ хранения</span>
              <strong>{snapshot.snapshot_storage_key}</strong>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
