import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { assetUrl, getPublicEvent } from "../../services/events";
import { Brand } from "../../components/ui/Brand";
import { ErrorNotice, Loading } from "../../components/ui/Feedback";
export default function EventPage() {
  const { eventSlug = "" } = useParams();
  const query = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => getPublicEvent(eventSlug),
  });
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  const event = query.data;
  return (
    <main className="public-shell">
      <Brand />
      <article className="public-card">
        <span className="public-star">✳</span>
        {event.logo_path && (
          <img
            className="event-logo"
            src={assetUrl(event.logo_path)}
            alt={event.name}
          />
        )}
        <span className="eyebrow">ВАШ БИЛЕТ В ЯРКИЙ МОМЕНТ</span>
        <h1>{event.name}</h1>
        <p>{event.description}</p>
        {event.status === "active" && event.registration_enabled ? (
          <Link className="button" to="register">
            Участвовать в розыгрыше <ArrowRight size={18} />
          </Link>
        ) : (
          <div className="notice">Регистрация закрыта</div>
        )}
        <Link className="text-link" to="screen">
          Открыть большой экран
        </Link>
      </article>
    </main>
  );
}
