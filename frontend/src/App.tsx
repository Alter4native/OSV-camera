import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  createCamera,
  createPerson,
  deletePersonEmbeddings,
  detectWebcamFrame,
  getAiHealth,
  getAiVectorStatus,
  getEmbeddingStatus,
  getMe,
  getModelQuality,
  getSettings,
  getSnapshotMetadata,
  listCameras,
  listEvents,
  listModels,
  listPersons,
  login,
  registerPersonEmbedding,
  type EventFilters,
  updateCamera,
  updateSettings,
  uploadPersonPhoto,
} from "./api/client";
import { AppShell, type ActivePage } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { clearSession, loadSession, saveSession, type Session } from "./auth/session";
import { CamerasPage } from "./pages/CamerasPage";
import { EventsPage } from "./pages/EventsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PeoplePage } from "./pages/PeoplePage";
import { SettingsPage } from "./pages/SettingsPage";
import type {
  Camera,
  CameraPayload,
  EventRecord,
  Person,
  PersonPayload,
  ModelVersion,
  QualityAnalysis,
  Settings,
  SnapshotMetadata,
  WebcamDetection,
} from "./types";
import { canWrite } from "./utils/format";

const defaultEmbeddingPayload = {
  embedding_model: "simple-hash-face-embedding",
  embedding_dim: 32,
  vector_collection: "person_face_embeddings",
  threshold: 0.65,
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.message} (${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Неожиданная ошибка";
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [activePage, setActivePage] = useState<ActivePage>("overview");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventFilters, setEventFilters] = useState<EventFilters>({});
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [models, setModels] = useState<ModelVersion[]>([]);
  const [quality, setQuality] = useState<QualityAnalysis | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotMetadata | null>(null);
  const [webcamDetection, setWebcamDetection] = useState<WebcamDetection | null>(null);
  const [aiHealth, setAiHealth] = useState<unknown>(null);
  const [vectorStatus, setVectorStatus] = useState<unknown>(null);
  const [embeddingStatus, setEmbeddingStatus] = useState<unknown>(null);

  const loadDashboard = useCallback(async () => {
    if (!session) {
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const token = session.tokens.access_token;
      const writable = canWrite(session.user.role);
      const [
        cameraResult,
        eventResult,
        personResult,
        modelResult,
        qualityResult,
        settingsResult,
        aiResult,
        vectorResult,
        embeddingResult,
      ] =
        await Promise.allSettled([
          listCameras(token),
          listEvents(token, eventFilters),
          writable ? listPersons(token) : Promise.resolve([]),
          listModels(token),
          getModelQuality(token),
          getSettings(token),
          getAiHealth(),
          getAiVectorStatus(),
          writable ? getEmbeddingStatus(token) : Promise.resolve({ status: "hidden", reason: "viewer role" }),
        ]);

      if (cameraResult.status === "fulfilled") setCameras(cameraResult.value);
      if (eventResult.status === "fulfilled") setEvents(eventResult.value);
      if (personResult.status === "fulfilled") setPersons(personResult.value);
      if (modelResult.status === "fulfilled") setModels(modelResult.value);
      if (qualityResult.status === "fulfilled") setQuality(qualityResult.value);
      if (settingsResult.status === "fulfilled") setSettings(settingsResult.value);
      if (aiResult.status === "fulfilled") setAiHealth(aiResult.value);
      if (vectorResult.status === "fulfilled") setVectorStatus(vectorResult.value);
      if (embeddingResult.status === "fulfilled") setEmbeddingStatus(embeddingResult.value);

      const failed = [
        cameraResult,
        eventResult,
        personResult,
        modelResult,
        qualityResult,
        settingsResult,
        aiResult,
        vectorResult,
        embeddingResult,
      ].filter((result) => result.status === "rejected").length;

      if (failed > 0) {
        setNotice(`${failed} запроса панели не выполнились. Проверьте backend и AI-service.`);
      }
    } finally {
      setLoading(false);
    }
  }, [eventFilters, session]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (session && !canWrite(session.user.role) && activePage === "people") {
      setActivePage("overview");
    }
  }, [activePage, session]);

  async function handleLogin(username: string, password: string) {
    setLoading(true);
    setLoginError(null);
    try {
      const tokens = await login(username, password);
      const user = await getMe(tokens.access_token);
      const nextSession = { tokens, user };
      saveSession(nextSession);
      setSession(nextSession);
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setSession(null);
    setActivePage("overview");
    setCameras([]);
    setEvents([]);
    setPersons([]);
    setSnapshot(null);
    setWebcamDetection(null);
  }

  async function runMutation(action: () => Promise<void>, success: string) {
    setLoading(true);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await loadDashboard();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCamera(payload: CameraPayload) {
    if (!session) return;
    await runMutation(() => createCamera(session.tokens.access_token, payload).then(() => undefined), "Камера добавлена.");
  }

  async function handleUpdateCamera(cameraId: string, payload: Partial<CameraPayload>) {
    if (!session) return;
    await runMutation(
      () => updateCamera(session.tokens.access_token, cameraId, payload).then(() => undefined),
      "Камера обновлена.",
    );
  }

  async function handleApplyEventFilters(filters: EventFilters) {
    if (!session) return;
    setLoading(true);
    setEventFilters(filters);
    setSnapshot(null);
    try {
      setEvents(await listEvents(session.tokens.access_token, filters));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadSnapshot(eventId: string) {
    if (!session) return;
    setLoading(true);
    setNotice(null);
    try {
      setSnapshot(await getSnapshotMetadata(session.tokens.access_token, eventId));
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePerson(payload: PersonPayload) {
    if (!session) return;
    await runMutation(() => createPerson(session.tokens.access_token, payload).then(() => undefined), "Профиль создан.");
  }

  async function handleUploadPersonPhoto(personId: string, file: File) {
    if (!session) return;
    await runMutation(async () => {
      const photo = await uploadPersonPhoto(session.tokens.access_token, personId, file);
      await registerPersonEmbedding(session.tokens.access_token, personId, {
        ...defaultEmbeddingPayload,
        photo_id: photo.photo_id,
        threshold: settings?.face_recognition_threshold ?? defaultEmbeddingPayload.threshold,
      });
    }, "Фото загружено, metadata embedding зарегистрирована.");
  }

  async function handleDeleteEmbeddings(personId: string) {
    if (!session) return;
    await runMutation(
      () => deletePersonEmbeddings(session.tokens.access_token, personId).then(() => undefined),
      "Удаление embeddings запрошено.",
    );
  }

  async function handleUpdateSettings(payload: Partial<Settings>) {
    if (!session) return;
    await runMutation(
      () => updateSettings(session.tokens.access_token, payload).then((updated) => setSettings(updated)),
      "Настройки сохранены.",
    );
  }

  async function handleWebcamDetect(frame: Blob, refreshDashboard = true) {
    if (refreshDashboard) {
      setLoading(true);
      setNotice(null);
    }
    try {
      const result = await detectWebcamFrame(frame);
      setWebcamDetection(result);
      if (refreshDashboard) {
        setNotice(`Детекция завершена: найдено людей ${result.person_count}.`);
        await loadDashboard();
      }
    } catch (error) {
      if (refreshDashboard) {
        setNotice(errorMessage(error));
      }
    } finally {
      if (refreshDashboard) {
        setLoading(false);
      }
    }
  }

  if (!session) {
    return <LoginScreen error={loginError} loading={loading} onLogin={handleLogin} />;
  }

  return (
    <AppShell
      activePage={activePage}
      loading={loading}
      user={session.user}
      onLogout={handleLogout}
      onNavigate={setActivePage}
      onRefresh={loadDashboard}
    >
      {notice ? <div className="notice-banner">{notice}</div> : null}

      {activePage === "overview" ? (
        <OverviewPage
          cameras={cameras}
          events={events}
          persons={persons}
          models={models}
          settings={settings}
          aiHealth={aiHealth}
          vectorStatus={vectorStatus}
          detection={webcamDetection}
          loading={loading}
          onDetectWebcam={handleWebcamDetect}
        />
      ) : null}

      {activePage === "cameras" ? (
        <CamerasPage
          cameras={cameras}
          role={session.user.role}
          onCreate={handleCreateCamera}
          onUpdate={handleUpdateCamera}
        />
      ) : null}

      {activePage === "events" ? (
        <EventsPage
          cameras={cameras}
          events={events}
          filters={eventFilters}
          snapshot={snapshot}
          onApplyFilters={handleApplyEventFilters}
          onLoadSnapshot={handleLoadSnapshot}
        />
      ) : null}

      {activePage === "people" && canWrite(session.user.role) ? (
        <PeoplePage
          persons={persons}
          onCreate={handleCreatePerson}
          onUploadPhoto={handleUploadPersonPhoto}
          onDeleteEmbeddings={handleDeleteEmbeddings}
        />
      ) : null}

      {activePage === "settings" ? (
        <SettingsPage
          role={session.user.role}
          settings={settings}
          models={models}
          quality={quality}
          vectorStatus={vectorStatus}
          embeddingStatus={embeddingStatus}
          onUpdate={handleUpdateSettings}
        />
      ) : null}
    </AppShell>
  );
}
