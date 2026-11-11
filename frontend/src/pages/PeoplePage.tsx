import { FormEvent, useState } from "react";
import { Trash2, Upload, UserPlus } from "lucide-react";

import { EmptyState } from "../components/EmptyState";
import type { Person, PersonPayload } from "../types";
import { formatDateTime } from "../utils/format";

type PeoplePageProps = {
  persons: Person[];
  onCreate: (payload: PersonPayload) => Promise<void>;
  onUploadPhoto: (personId: string, file: File) => Promise<void>;
  onDeleteEmbeddings: (personId: string) => Promise<void>;
};

export function PeoplePage({ persons, onCreate, onUploadPhoto, onDeleteEmbeddings }: PeoplePageProps) {
  const [draft, setDraft] = useState<PersonPayload>({ display_name: "", external_id: "", notes: "" });
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.display_name.trim()) {
      return;
    }
    await onCreate(draft);
    setDraft({ display_name: "", external_id: "", notes: "" });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPersonId || !selectedFile) {
      return;
    }
    await onUploadPhoto(selectedPersonId, selectedFile);
    setSelectedFile(null);
  }

  return (
    <section className="page-stack">
      <div className="content-grid content-grid--balanced">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Реестр людей</h2>
              <span>{persons.length} профиль(ей)</span>
            </div>
          </div>
          {persons.length ? (
            <div className="person-list">
              {persons.map((person) => (
                <div className="person-row person-card" key={person.person_id}>
                  <div className="avatar">{person.display_name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{person.display_name}</strong>
                    <span>
                      {person.external_id ?? "Без внешнего ID"} - фото: {person.photo_count}
                    </span>
                    <small className={person.photo_count > 0 ? "profile-ready" : "profile-pending"}>
                      {person.photo_count > 0 ? "Профиль готов к распознаванию" : "Нужно добавить фото"}
                    </small>
                  </div>
                  <button className="text-button danger-text" type="button" onClick={() => onDeleteEmbeddings(person.person_id)}>
                    <Trash2 aria-hidden="true" />
                    Удалить векторные данные
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Профилей пока нет" body="Создайте профиль и добавьте фотографию для регистрации в системе распознавания." />
          )}
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Создать профиль</h2>
              <span>Доступно администратору и оператору</span>
            </div>
            <UserPlus aria-hidden="true" />
          </div>
          <form className="form-grid" onSubmit={handleCreate}>
            <label>
              Имя
              <input
                value={draft.display_name}
                onChange={(event) => setDraft({ ...draft, display_name: event.target.value })}
              />
            </label>
            <label>
              Внешний ID
              <input
                value={draft.external_id ?? ""}
                onChange={(event) => setDraft({ ...draft, external_id: event.target.value })}
              />
            </label>
            <label>
              Заметки
              <textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </label>
            <button className="primary-button" type="submit">
              <UserPlus aria-hidden="true" />
              Создать профиль
            </button>
          </form>
        </article>
      </div>

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2>Загрузить фото для распознавания</h2>
            <span>После загрузки фото регистрируется metadata векторного профиля.</span>
          </div>
          <Upload aria-hidden="true" />
        </div>
        <form className="filter-bar" onSubmit={handleUpload}>
          <label>
            Человек
            <select value={selectedPersonId} onChange={(event) => setSelectedPersonId(event.target.value)}>
              <option value="">Выберите профиль</option>
              {persons.map((person) => (
                <option key={person.person_id} value={person.person_id}>
                  {person.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Фото лица
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={!selectedPersonId || !selectedFile}>
            <Upload aria-hidden="true" />
            Загрузить
          </button>
        </form>
        <p className="fine-print">Текущее время панели: {formatDateTime(new Date().toISOString())}</p>
      </article>
    </section>
  );
}
