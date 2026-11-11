import {
  Bell,
  Camera,
  Gauge,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import type { Role, User } from "../types";
import { canWrite } from "../utils/format";

export type ActivePage = "overview" | "cameras" | "events" | "people" | "settings";

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
  user: User;
  onNavigate: (page: ActivePage) => void;
  onRefresh: () => void;
  onLogout: () => void;
};

function visibleNavItems(role: Role) {
  return navItems.filter((item) => !item.writeOnly || canWrite(role));
}

export function AppShell({ activePage, children, loading, user, onNavigate, onRefresh, onLogout }: AppShellProps) {
  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Основная навигация">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck aria-hidden="true" /></div>
          <div>
            <span>OSV-PC</span>
            <small>VISION CONTROL</small>
          </div>
        </div>

        <nav className="nav-list">
          {visibleNavItems(user.role).map((item, index, visibleItems) => {
            const Icon = item.icon;
            const showGroup = index === 0 || visibleItems[index - 1].group !== item.group;
            return (
              <div className="nav-group" key={item.id}>
                {showGroup ? <span className="nav-group__label">{item.group}</span> : null}
                <button
                  className={`nav-item ${activePage === item.id ? "nav-item--active" : ""}`}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  {activePage === item.id ? <Sparkles className="nav-item__spark" aria-hidden="true" /> : null}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <span className="status-dot" />
          <span>Система онлайн</span>
          <small>v0.1 live</small>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="topbar-kicker">LIVE / CONTROL ROOM</span>
            <h1>Центр мониторинга</h1>
            <p>Компьютерное зрение, люди и события безопасности</p>
          </div>
          <div className="topbar-actions">
            <div className="role-chip">
              <Gauge aria-hidden="true" />
              <span>{user.username}</span>
              <strong>{user.role}</strong>
            </div>
            <button className="secondary-button" type="button" onClick={onRefresh} disabled={loading}>
              {loading ? "Обновление" : "Обновить"}
            </button>
            <button className="icon-button" type="button" onClick={onLogout} aria-label="Выйти">
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        {children}
      </section>
    </main>
  );
}
