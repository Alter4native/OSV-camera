import {
  Bell,
  Camera,
  Gauge,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

import type { Role, User } from "../types";
import { canWrite } from "../utils/format";

export type ActivePage = "overview" | "cameras" | "events" | "people" | "settings";

const navItems: Array<{ id: ActivePage; label: string; icon: typeof LayoutDashboard; writeOnly?: boolean }> = [
  { id: "overview", label: "Дашборд", icon: LayoutDashboard },
  { id: "cameras", label: "Камеры", icon: Camera },
  { id: "events", label: "События", icon: Bell },
  { id: "people", label: "Люди", icon: Users, writeOnly: true },
  { id: "settings", label: "Настройки", icon: Settings },
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
          <ShieldCheck aria-hidden="true" />
          <span>OSV-PC</span>
        </div>

        <nav className="nav-list">
          {visibleNavItems(user.role).map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activePage === item.id ? "nav-item--active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Центр мониторинга</h1>
            <p>Локальная веб-камера, детекция людей и события безопасности</p>
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
