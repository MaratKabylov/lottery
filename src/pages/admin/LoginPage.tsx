import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useAuth } from "../../app/providers/AuthProvider";
import { supabase } from "../../lib/supabase";
import { Brand } from "../../components/ui/Brand";
import { ErrorNotice } from "../../components/ui/Feedback";
import { useAction } from "../../hooks/useAction";

export default function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const action = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const returnTo =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    !location.state.from.startsWith("//")
      ? location.state.from
      : "/admin/events";
  if (auth.session && auth.profile && !auth.loading)
    return <Navigate to={returnTo} replace />;
  function submit(e: FormEvent) {
    e.preventDefault();
    void action.run(async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    });
  }
  return (
    <div className="login-shell">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">МАЛЕНЬКИЕ НОМЕРА. БОЛЬШИЕ МОМЕНТЫ.</span>
          <h1>
            Подарите гостям
            <br />
            <em>повод улыбнуться.</em>
          </h1>
          <p>
            Регистрация, призы и честный розыгрыш.
            <br />
            Всё для вашего следующего события.
          </p>
        </div>
        <span className="story-footer">События, которые запоминаются.</span>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="badge">
            <LockKeyhole size={15} /> Для организаторов
          </span>
          <h2>С возвращением</h2>
          <p className="muted">Войдите, чтобы управлять вашим мероприятием.</p>
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Пароль
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorNotice
              error={
                action.error || (auth.error ? new Error(auth.error) : null)
              }
            />
            <button
              className="button"
              disabled={action.pending || auth.loading}
            >
              Войти <ArrowRight size={18} />
            </button>
          </form>
          <p className="small muted">
            Доступ предоставляется администратором мероприятия.
          </p>
        </div>
      </section>
    </div>
  );
}
