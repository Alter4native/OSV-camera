import {
  Bell,
  Camera,
  Gauge,
  LayoutDashboard,
  LogOut,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";

import type { Role, User } from "../types";
import { canWrite } from "../utils/format";

export type ActivePage = "overview" | "cameras" | "events" | "people" | "settings";

const pageInfo: Record<ActivePage, { title: string; description: string }> = {
  overview: { title: "Мониторинг", description: "Просмотр с камеры и отслеживание людей в кадре." },
  cameras: { title: "Камеры", description: "Настройка веб-камер и RTSP-источников." },
  events: { title: "События", description: "История детекций, состояний камер и сохранённых кадров." },
  people: { title: "Люди", description: "Профили, фотографии и данные для распознавания." },
  settings: { title: "Настройки", description: "Параметры анализа, хранения данных и моделей." },
};

const navItems: Array<{ id: ActivePage; label: string; icon: typeof LayoutDashboard; group: string; writeOnly?: boolean }> = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard, group: "Оперативный центр" },
  { id: "cameras", label: "Камеры", icon: Camera, group: "Оперативный центр" },
  { id: "events", label: "Лента событий", icon: Bell, group: "Аналитика" },
  { id: "people", label: "Профили людей", icon: Users, group: "Аналитика", writeOnly: true },
  { id: "settings", label: "Система и модели", icon: Settings, group: "Конфигурация" },
];

type AppShellProps = {
  activePage: ActivePage;
  children: React.ReactNode;
  loading: boolean;
  theme: "light" | "dark";
  user: User;
  onNavigate: (page: ActivePage) => void;
  onRefresh: () => void;
  onLogout: () => void;
  onToggleTheme: () => void;
};

function visibleNavItems(role: Role) {
  return navItems.filter((item) => !item.writeOnly || canWrite(role));
}

export function AppShell({ activePage, children, loading, theme, user, onNavigate, onRefresh, onLogout, onToggleTheme }: AppShellProps) {
  const navigationItems = visibleNavItems(user.role);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Основная навигация">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck aria-hidden="true" /></div>
          <div>
            <span>OSV-PC</span>
            <small>ПОДСЧЁТ ЛЮДЕЙ</small>
          </div>
        </div>

        <nav className={`nav-list nav-list--${navigationItems.length}`}>
          {navigationItems.map((item, index, visibleItems) => {
            const Icon = item.icon;
            const showGroup = index === 0 || visibleItems[index - 1].group !== item.group;
            return (
              <div className="nav-group" key={item.id}>
                {showGroup ? <span className="nav-group__label">{item.group}</span> : null}
                <button
                  className={`nav-item ${activePage === item.id ? "nav-item--active" : ""}`}
                  type="button"
                  aria-current={activePage === item.id ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </aside>

      <section className={`workspace workspace--${activePage}`}>
        <header className="topbar">
          <div>
            <h1>{pageInfo[activePage].title}</h1>
            <p>{pageInfo[activePage].description}</p>
          </div>
          <div className="topbar-actions">
            <div className="role-chip">
              <Gauge aria-hidden="true" />
              <span>{user.username}</span>
              <strong>{user.role}</strong>
            </div>
            <button className="secondary-button refresh-button" type="button" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={loading ? "refresh-icon is-spinning" : "refresh-icon"} aria-hidden="true" />
              <span>{loading ? "Обновляем..." : "Обновить"}</span>
            </button>
            <button
              className="icon-button theme-toggle"
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
              aria-pressed={theme === "dark"}
              title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            >
              {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Выйти">
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="page-transition" key={activePage}>
          {children}
        </div>
      </section>
    </main>
  );
}
