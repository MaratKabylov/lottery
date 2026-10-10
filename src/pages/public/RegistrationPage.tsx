import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { getPublicEvent, assetUrl } from "../../services/events";
import { registerParticipant } from "../../services/participants";
import { Brand } from "../../components/ui/Brand";
import { ErrorNotice, Loading } from "../../components/ui/Feedback";
import { useAction } from "../../hooks/useAction";
export default function RegistrationPage() {
  const { eventSlug = "" } = useParams();
  const navigate = useNavigate();
  const action = useAction();
  const query = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => getPublicEvent(eventSlug),
  });
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  const event = query.data;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void action.run(
      () =>
        registerParticipant({
          event_slug: eventSlug,
          name: String(form.get("name")).trim(),
          phone: String(form.get("phone")).trim(),
          email: String(form.get("email")).trim(),
        }),
      (result) => {
        try {
          sessionStorage.setItem(
            `receipt:${eventSlug}`,
            JSON.stringify(result),
          );
        } catch {
          /* Navigation state still works if browser storage is disabled. */
        }
        navigate(`/event/${eventSlug}/success`, { state: result });
      },
    );
  }
  return (
    <main className="public-shell">
      <Brand />
      <article className="public-card">
        {event.logo_path && (
          <img
            className="event-logo"
            src={assetUrl(event.logo_path)}
            alt={event.name}
          />
        )}
        <span className="eyebrow">{event.name}</span>
        <h1>
          А вдруг
          <br />
          <em>повезёт именно вам?</em>
        </h1>
        <p className="muted">
          Зарегистрируйтесь, получите номер и ждите розыгрыша.
        </p>
        {event.status !== "active" || !event.registration_enabled ? (
          <div className="notice">Регистрация закрыта</div>
        ) : (
          <form onSubmit={submit}>
            <label>
              Ваше имя
              <input
                name="name"
                autoComplete="name"
                required
                maxLength={120}
                placeholder="Как к вам обращаться?"
              />
            </label>
            <label>
              Телефон{!event.require_phone && <small>Необязательно</small>}
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                required={event.require_phone}
                maxLength={40}
                placeholder="+7 701 123 45 67"
              />
            </label>
            <label>
              Email{!event.require_email && <small>Необязательно</small>}
              <input
                name="email"
                type="email"
                autoComplete="email"
                required={event.require_email}
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            <ErrorNotice error={action.error} />
            <button className="button" disabled={action.pending}>
              {action.pending ? "Получаем ваш номер…" : "Получить номер"}{" "}
              <ArrowRight size={18} />
            </button>
            <p className="small muted">
              Контакты доступны только организатору мероприятия.
            </p>
          </form>
        )}
      </article>
      <p className="public-footer">События, которые запоминаются.</p>
    </main>
  );
}
