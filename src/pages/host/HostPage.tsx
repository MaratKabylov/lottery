import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Play,
  Check,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { useEventData, useScreen } from "../../hooks/useEventData";
import { useCountdown } from "../../hooks/useCountdown";
import { useAction } from "../../hooks/useAction";
import { drawWinner, finishDraw } from "../../services/draws";
import { getStaffStats } from "../../services/events";
import { formatTicket } from "../../utils/format";
import { Brand } from "../../components/ui/Brand";
import { Connection, ErrorNotice, Loading } from "../../components/ui/Feedback";
export default function HostPage() {
  const { eventId = "" } = useParams();
  const data = useEventData(eventId);
  const screen = useScreen(data.event.data?.slug || "", false);
  const stats = useQuery({
    queryKey: ["event", eventId, "stats"],
    queryFn: () => getStaffStats(eventId),
    enabled: Boolean(eventId),
    refetchInterval: 15_000,
  });
  const client = useQueryClient();
  const action = useAction();
  const [selected, setSelected] = useState("");
  const remaining = useCountdown(
    screen.data?.state.countdown_end,
    screen.data?.server_time,
    screen.dataUpdatedAt,
  );
  if (data.event.isPending) return <Loading />;
  if (!data.event.data) return <ErrorNotice error={data.event.error} />;
  const event = data.event.data;
  const pending = data.draws.data?.find((d) => d.status === "pending");
  const prizeId = pending?.prize_id || selected;
  const winner = screen.data?.winner;
  const online =
    data.connection === "online" &&
    !screen.isError &&
    !data.draws.isError &&
    !data.prizes.isError;
  const eligiblePrizes = (data.prizes.data || []).filter(
    (p) =>
      p.is_active &&
      p.quantity >
        (data.draws.data || []).filter(
          (d) => d.prize_id === p.id && d.status === "confirmed",
        ).length,
  );
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["event", eventId] });
    void client.invalidateQueries({ queryKey: ["screen"] });
  };
  return (
    <main className="host-shell">
      <header className="host-header">
        <Brand />
        <Connection status={data.connection} />
        <Link className="text-link" to="/admin/events">
          <ArrowLeft size={16} /> Мероприятия
        </Link>
      </header>
      <div className="host-title">
        <span className="eyebrow">ПАНЕЛЬ ВЕДУЩЕГО</span>
        <h1>{event.name}</h1>
        <a
          className="text-link"
          href={`/event/${event.slug}/screen`}
          target="_blank"
          rel="noreferrer"
        >
          Открыть большой экран <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="host-stats">
        <span>
          <strong>{stats.data?.participants_count ?? "—"}</strong> участников
        </span>
        <span>
          <strong>{stats.data?.checked_in_count ?? "—"}</strong> присутствуют
        </span>
        <span>
          <strong>{stats.data?.confirmed_winners_count ?? "—"}</strong>{" "}
          победителей
        </span>
      </div>
      <ErrorNotice
        error={
          action.error ||
          screen.error ||
          data.draws.error ||
          data.prizes.error ||
          stats.error
        }
      />
      {!online && (
        <div className="notice">
          Ожидаем соединение с сервером. Розыгрыш временно недоступен.
        </div>
      )}
      <section className="host-control">
        <span className="eyebrow">
          {pending ? "СЧАСТЛИВЫЙ МОМЕНТ" : "ЧТО РАЗЫГРАЕМ СЛЕДУЮЩИМ?"}
        </span>
        {pending && remaining > 0 ? (
          <div className="host-drawing">
            <span className="drawing-star">✳</span>
            <h2>Выбираем счастливый номер…</h2>
            <p>{Math.ceil(remaining / 1000)} сек.</p>
          </div>
        ) : pending &&
          winner &&
          screen.data?.state.current_draw_id === pending.id ? (
          <div className="host-winner">
            <Trophy size={40} />
            <h2>
              {winner.ticket_number !== null
                ? `№${formatTicket(winner.ticket_number, event.ticket_digits)}`
                : "Победитель выбран"}
            </h2>
            {winner.name && <p>{winner.name}</p>}
            <p className="muted">{screen.data?.prize?.name}</p>
            <div className="button-row">
              <button
                className="button"
                disabled={action.pending || !online}
                onClick={() =>
                  void action.run(() => finishDraw(pending.id, true), refresh)
                }
              >
                <Check size={18} /> Подтвердить
              </button>
              <button
                className="button secondary"
                disabled={action.pending || !online}
                onClick={() =>
                  void action.run(() => finishDraw(pending.id, false), refresh)
                }
              >
                <RotateCcw size={17} /> Победитель отсутствует
              </button>
            </div>
          </div>
        ) : pending ? (
          <Loading />
        ) : (
          <>
            <label className="prize-select-label">
              Выберите приз
              <select
                value={prizeId}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Выберите подарок</option>
                {eligiblePrizes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · осталось{" "}
                    {p.quantity -
                      (data.draws.data || []).filter(
                        (d) => d.prize_id === p.id && d.status === "confirmed",
                      ).length}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button draw-button"
              disabled={
                !prizeId ||
                !eligiblePrizes.some((p) => p.id === prizeId) ||
                action.pending ||
                !online ||
                event.status !== "active" ||
                !event.draw_enabled ||
                data.draws.isPending
              }
              onClick={() =>
                void action.run(() => drawWinner(eventId, prizeId), refresh)
              }
            >
              <Play size={20} />
              {action.pending ? "Запускаем…" : "Начать розыгрыш"}
            </button>
            <p className="small muted">
              Победителя выбирает сервер. Результат сохраняется до начала
              анимации.
            </p>
            {!eligiblePrizes.length && !data.prizes.isPending && (
              <p>Все активные призы разыграны или ещё не добавлены.</p>
            )}
          </>
        )}
      </section>
      <p className="public-footer">Пусть этот момент запомнится.</p>
    </main>
  );
}
