import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { listEvents, saveEvent } from "../../services/events";
import { ErrorNotice, Loading, Empty } from "../../components/ui/Feedback";
import { useAction } from "../../hooks/useAction";
import { useAuth } from "../../app/providers/AuthProvider";
import { formatDate } from "../../utils/format";
const statuses = {
  draft: "Черновик",
  active: "Активно",
  finished: "Завершено",
  archived: "В архиве",
};
export default function EventsPage() {
  const { profile } = useAuth();
  const query = useQuery({ queryKey: ["events"], queryFn: listEvents });
  const client = useQueryClient();
  const action = useAction();
  const [creating, setCreating] = useState(false);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void action.run(
      () =>
        saveEvent({
          name: String(form.get("name")).trim(),
          slug: String(form.get("slug")).trim(),
          description: String(form.get("description")).trim() || null,
        }),
      () => {
        setCreating(false);
        void client.invalidateQueries({ queryKey: ["events"] });
      },
    );
  }
  return (
    <section className="workspace">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ОБЗОР</span>
          <h1>
            Мероприятия
            <span className="count">{query.data?.length ?? "—"}</span>
          </h1>
          <p>Создавайте события и превращайте гостей в участников.</p>
        </div>
        {profile?.role === "admin" && (
          <button className="button" onClick={() => setCreating(!creating)}>
            <Plus size={18} /> Создать мероприятие
          </button>
        )}
      </div>
      {creating && (
        <form className="panel form-grid" onSubmit={submit}>
          <label>
            Название
            <input
              name="name"
              required
              maxLength={200}
              placeholder="Открытие учебного центра"
            />
          </label>
          <label>
            Адрес мероприятия
            <input
              name="slug"
              required
              maxLength={200}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              placeholder="opening-2026"
            />
            <small>Латинские буквы, цифры и дефис</small>
          </label>
          <label className="full">
            Описание
            <textarea name="description" rows={2} />
          </label>
          <ErrorNotice error={action.error} />
          <div className="full button-row">
            <button className="button" disabled={action.pending}>
              Создать черновик
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setCreating(false)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      <ErrorNotice error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : !query.data?.length ? (
        <Empty>
          <CalendarDays size={32} />
          <h3>Начните с вашего первого события</h3>
          <p>Добавьте мероприятие, настройте призы и пригласите гостей.</p>
        </Empty>
      ) : (
        <div className="event-grid">
          {query.data.map((event, index) => (
            <Link
              className="event-card"
              key={event.id}
              to={
                profile?.role === "admin"
                  ? `/admin/events/${event.id}`
                  : `/host/${event.id}`
              }
            >
              <div className={`event-cover cover-${index % 3}`}>
                <span className="cover-ornament">✳</span>
                <span className={`status ${event.status}`}>
                  {statuses[event.status]}
                </span>
                <span className="cover-caption">
                  EVENT / {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="event-card-body">
                <span className="small muted">
                  Создано {formatDate(event.created_at)}
                </span>
                <h2>{event.name}</h2>
                <p>
                  {event.description ||
                    "Всё готово для вашего следующего яркого события."}
                </p>
                <div className="card-bottom">
                  <span>/{event.slug}</span>
                  <span className="round-arrow">
                    <ArrowUpRight size={20} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
