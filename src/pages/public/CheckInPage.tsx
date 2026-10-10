import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { getPublicEvent } from "../../services/events";
import { checkIn } from "../../services/participants";
import { useAction } from "../../hooks/useAction";
import { Brand } from "../../components/ui/Brand";
import { ErrorNotice, Loading } from "../../components/ui/Feedback";
export default function CheckInPage() {
  const { eventSlug = "" } = useParams();
  const action = useAction();
  const [done, setDone] = useState("");
  const query = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => getPublicEvent(eventSlug),
  });
  if (query.isPending) return <Loading />;
  if (!query.data) return <ErrorNotice error={query.error} />;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void action.run(
      () => checkIn(query.data!.id, Number(form.get("ticket"))),
      (p) => setDone(`${p.name} · №${p.ticket_number} — присутствие отмечено`),
    );
  }
  return (
    <main className="public-shell">
      <Brand />
      <article className="public-card">
        <span className="eyebrow">{query.data.name}</span>
        <h1>Встречаем гостей</h1>
        <p className="muted">Введите номер билета участника.</p>
        <form onSubmit={submit}>
          <label>
            Номер
            <input name="ticket" type="number" min={1} required />
          </label>
          <ErrorNotice error={action.error} />
          {done && (
            <div className="notice" role="status">
              {done}
            </div>
          )}
          <button className="button" disabled={action.pending}>
            Отметить присутствие
          </button>
        </form>
      </article>
    </main>
  );
}
