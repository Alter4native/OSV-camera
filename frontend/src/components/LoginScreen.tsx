import { FormEvent, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

type LoginScreenProps = {
  error: string | null;
  loading: boolean;
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginScreen({ error, loading, onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(username, password);
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="login-brand">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h1>OSV-PC</h1>
            <p>People counting · панель видеоаналитики и детекции людей</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Логин
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            Пароль
            <input
              value={password}
              type="password"
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            <Lock aria-hidden="true" />
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>

        <p className="login-hint">Демо-пользователи: admin/admin, operator/operator, viewer/viewer.</p>
      </section>
    </main>
  );
}
