import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { isConfigured, supabase } from "../../lib/supabase";
import { AdminLayout } from "../../components/ui/AdminLayout";
import { Brand } from "../../components/ui/Brand";
import { ErrorNotice, Loading } from "../../components/ui/Feedback";

const Login = lazy(() => import("../../pages/admin/LoginPage"));
const Events = lazy(() => import("../../pages/admin/EventsPage"));
const Dashboard = lazy(() => import("../../pages/admin/EventDashboardPage"));
const Participants = lazy(() => import("../../pages/admin/ParticipantsPage"));
const Prizes = lazy(() => import("../../pages/admin/PrizesPage"));
const Draws = lazy(() => import("../../pages/admin/DrawsPage"));
const Settings = lazy(() => import("../../pages/admin/SettingsPage"));
const Event = lazy(() => import("../../pages/public/EventPage"));
const Registration = lazy(() => import("../../pages/public/RegistrationPage"));
const Success = lazy(
  () => import("../../pages/public/RegistrationSuccessPage"),
);
const CheckIn = lazy(() => import("../../pages/public/CheckInPage"));
const Screen = lazy(() => import("../../pages/public/ScreenPage"));
const Host = lazy(() => import("../../pages/host/HostPage"));

function Guard({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <Loading />;
  if (!auth.session)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (auth.error) return <ErrorNotice error={new Error(auth.error)} />;
  if (!auth.profile)
    return (
      <main className="public-shell">
        <Brand />
        <h1>Доступ ещё не назначен</h1>
        <p>Попросите администратора добавить профиль с ролью admin или host.</p>
        <button className="button" onClick={() => void supabase.auth.signOut()}>
          Выйти
        </button>
      </main>
    );
  if (admin && auth.profile.role !== "admin")
    return <Navigate to="/admin/events" replace />;
  return children;
}
function Setup() {
  return (
    <main className="public-shell">
      <Brand />
      <article className="public-card">
        <span className="eyebrow">EVENTDRAW / НАЧАЛО РАБОТЫ</span>
        <h1>
          Сначала подключим
          <br />
          <em>ваше событие.</em>
        </h1>
        <p>Приложение готово к подключению Supabase.</p>
        <ol className="setup-steps">
          <li>
            Запустите <code>npm run supabase -- start</code> (нужен Docker).
          </li>
          <li>
            Примените миграции: <code>npm run supabase -- db reset</code>.
          </li>
          <li>
            Скопируйте <code>.env.example</code> в <code>.env</code>, заполните
            URL и публичный ключ.
          </li>
          <li>
            Создайте администратора по инструкции в <code>README.md</code> и
            перезапустите Vite.
          </li>
        </ol>
      </article>
    </main>
  );
}
export function AppRouter() {
  if (!isConfigured) return <Setup />;
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Navigate to="/admin/events" replace />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/admin"
          element={
            <Guard>
              <AdminLayout />
            </Guard>
          }
        >
          <Route index element={<Navigate to="events" replace />} />
          <Route path="events" element={<Events />} />
          <Route
            path="events/:eventId"
            element={
              <Guard admin>
                <Dashboard />
              </Guard>
            }
          />
          <Route
            path="events/:eventId/participants"
            element={
              <Guard admin>
                <Participants />
              </Guard>
            }
          />
          <Route
            path="events/:eventId/prizes"
            element={
              <Guard admin>
                <Prizes />
              </Guard>
            }
          />
          <Route
            path="events/:eventId/draws"
            element={
              <Guard admin>
                <Draws />
              </Guard>
            }
          />
          <Route
            path="events/:eventId/settings"
            element={
              <Guard admin>
                <Settings />
              </Guard>
            }
          />
        </Route>
        <Route
          path="/host/:eventId"
          element={
            <Guard>
              <Host />
            </Guard>
          }
        />
        <Route path="/event/:eventSlug" element={<Event />} />
        <Route path="/event/:eventSlug/register" element={<Registration />} />
        <Route path="/event/:eventSlug/success" element={<Success />} />
        <Route
          path="/event/:eventSlug/check-in"
          element={
            <Guard>
              <CheckIn />
            </Guard>
          }
        />
        <Route path="/event/:eventSlug/screen" element={<Screen />} />
        <Route
          path="*"
          element={
            <main className="public-shell">
              <Brand />
              <h1>Страница не найдена</h1>
              <Link className="button" to="/">
                На главную
              </Link>
            </main>
          }
        />
      </Routes>
    </Suspense>
  );
}
