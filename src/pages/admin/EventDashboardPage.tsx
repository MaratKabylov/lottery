import { useParams, Link } from "react-router-dom";
import { Users, UserCheck, Trophy, Gift, ArrowUpRight } from "lucide-react";
import { useEventData } from "../../hooks/useEventData";
import { EventNav } from "../../components/ui/EventNav";
import { ErrorNotice, Loading, Connection } from "../../components/ui/Feedback";
import { RegistrationQR } from "../../components/ui/RegistrationQR";
export default function EventDashboardPage() {
  const { eventId = "" } = useParams();
  const data = useEventData(eventId, true);
  if (data.event.isPending) return <Loading />;
  if (!data.event.data) return <ErrorNotice error={data.event.error} />;
  const event = data.event.data;
  const participants = data.participants.data?.filter((p) => !p.is_test) || [];
  const confirmed =
    data.draws.data?.filter((d) => d.status === "confirmed" && !d.is_test) || [];
  const remaining = (data.prizes.data || [])
    .filter((p) => p.is_active)
    .reduce(
      (n, p) =>
        n + p.quantity - confirmed.filter((d) => d.prize_id === p.id).length,
      0,
    );
  const stats = [
    [Users, "Участников", participants.length],
    [
      UserCheck,
      "Присутствуют",
      participants.filter((p) => p.checked_in).length,
    ],
    [
      Trophy,
      "Победителей",
      new Set(confirmed.map((d) => d.participant_id)).size,
    ],
    [Gift, "Призов осталось", remaining],
  ] as const;
  return (
    <section className="workspace">
      <EventNav event={event} />
      <Connection status={data.connection} />
      <ErrorNotice
        error={data.participants.error || data.prizes.error || data.draws.error}
      />
      <div className="stats-grid">
        {stats.map(([Icon, label, value]) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>
              {data.participants.isPending ||
              data.draws.isPending ||
              data.prizes.isPending
                ? "—"
                : value}
            </strong>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <article className="panel">
          <span className="eyebrow">ПРИГЛАСИТЕ ГОСТЕЙ</span>
          <h2>Один QR — и вы в игре</h2>
          <p className="muted">
            Разместите код у входа или покажите на экране.
          </p>
          <RegistrationQR slug={event.slug} download />
          {event.status !== "active" && (
            <div className="notice">
              Регистрация доступна после активации мероприятия в настройках.
            </div>
          )}
        </article>
        <article className="screen-promo">
          <span className="eyebrow">ГЛАВНЫЙ МОМЕНТ ВЕЧЕРА</span>
          <h2>
            Большой экран.
            <br />
            <em>Большие эмоции.</em>
          </h2>
          <span className="promo-star">✳</span>
          <p>
            QR-код, анимация розыгрыша и победитель — для всех гостей
            одновременно.
          </p>
          <Link
            className="button light"
            to={`/event/${event.slug}/screen`}
            target="_blank"
          >
            Открыть экран <ArrowUpRight size={17} />
          </Link>
        </article>
      </div>
    </section>
  );
}
