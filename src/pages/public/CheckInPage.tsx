import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getPublicEvent } from "../../services/events";
import { checkIn, checkInByPhone } from "../../services/participants";
import { formatTicket } from "../../utils/format";
import { useAction } from "../../hooks/useAction";
import { Brand } from "../../components/ui/Brand";
import { ErrorNotice, Loading } from "../../components/ui/Feedback";
export default function CheckInPage() {
  const { eventSlug = "" } = useParams();
  const action = useAction();
  const client = useQueryClient();
  const [method, setMethod] = useState("ticket");
  const [done, setDone] = useState("");
  const query = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => getPublicEvent(eventSlug),
  });
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDone("");
    const form = new FormData(e.currentTarget);
    const checkedIn = form.get("attendance") === "present";
    void action.run(
      () =>
        method === "phone"
          ? checkInByPhone(query.data!.id, String(form.get("phone")), checkedIn)
          : checkIn(query.data!.id, Number(form.get("ticket")), checkedIn),
      (p) => {
        setDone(
          `${p.name} · №${formatTicket(p.ticket_number, query.data!.ticket_digits)} — ${p.checked_in ? "присутствие отмечено" : "отметка присутствия отменена"}`,
        );
        void client.invalidateQueries({ queryKey: ["event", query.data!.id] });
        void client.invalidateQueries({ queryKey: ["screen", eventSlug] });
      },
    );
  }
  return (
    <main className="public-shell">
      <Brand />
      <article className="public-card">
        <span className="eyebrow">{query.data.name}</span>
        <h1>Встречаем гостей</h1>
        <p className="muted">Найдите гостя по номеру билета или телефону.</p>
        <form onSubmit={submit}>
          <label>
            Найти участника
            <select
              value={method}
              disabled={action.pending}
              onChange={(e) => {
                setMethod(e.target.value);
                setDone("");
              }}
            >
              <option value="ticket">По номеру билета</option>
              <option value="phone">По телефону</option>
            </select>
          </label>
          {method === "ticket" ? (
            <label>
              Номер
              <input
                name="ticket"
                type="number"
                min={1}
                max={2147483647}
                step={1}
                required
                disabled={action.pending}
                onChange={() => setDone("")}
              />
            </label>
          ) : (
            <label>
              Телефон
              <input
                name="phone"
                type="tel"
                autoComplete="off"
                placeholder="8 701 123 45 67"
                maxLength={40}
                required
                disabled={action.pending}
                onChange={() => setDone("")}
              />
            </label>
          )}
          <label>
            Действие
            <select
              name="attendance"
              disabled={action.pending}
              onChange={() => setDone("")}
            >
              <option value="present">Отметить присутствие</option>
              <option value="absent">Отменить отметку присутствия</option>
            </select>
          </label>
          <ErrorNotice error={action.error} />
          {done && (
            <div className="notice" role="status">
              {done}
            </div>
          )}
          <button className="button" disabled={action.pending}>
            {action.pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      </article>
    </main>
  );
}
