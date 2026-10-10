import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CalendarDays, LogOut, ShieldCheck } from "lucide-react";
import { Brand } from "./Brand";
import { useAuth } from "../../app/providers/AuthProvider";
import { supabase } from "../../lib/supabase";
import { useAction } from "../../hooks/useAction";
import { ErrorNotice } from "./Feedback";
export function AdminLayout() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const action = useAction();
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <NavLink to="/admin/events" className="sidebar-link">
          <CalendarDays size={19} /> Мероприятия
        </NavLink>
        <div className="sidebar-note">
          <SparkleNote />
          <p>
            Каждый гость —<br />
            часть большого события.
          </p>
        </div>
        <div className="account">
          <div className="avatar">
            {(profile?.display_name || "E").slice(0, 1)}
          </div>
          <div>
            <strong>{profile?.display_name || "Организатор"}</strong>
            <small>
              {profile?.role === "admin" ? "Администратор" : "Ведущий"}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label="Выйти"
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                navigate("/login");
              })
            }
          >
            <LogOut size={18} />
          </button>
        </div>
        <ErrorNotice error={action.error} />
      </aside>
      <main className="admin-main">
        <div className="topbar">
          <span>Ваши события. Ваши гости. Яркие моменты.</span>
          <span>
            <ShieldCheck size={15} /> Supabase
          </span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
function SparkleNote() {
  return <span className="note-star">✳</span>;
}
