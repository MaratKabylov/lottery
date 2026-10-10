import { useParams } from "react-router-dom";
import { useEventData } from "../../hooks/useEventData";
import { EventNav } from "../../components/ui/EventNav";
import { ErrorNotice, Loading, Empty } from "../../components/ui/Feedback";
import { formatDate, formatTicket } from "../../utils/format";
import { downloadCSV } from "../../utils/export";
export default function DrawsPage() {
  const { eventId = "" } = useParams();
  const data = useEventData(eventId, true);
  if (data.event.isPending) return <Loading />;
  if (!data.event.data) return <ErrorNotice error={data.event.error} />;
  return (
    <section className="workspace">
      <EventNav event={data.event.data} />
      <div className="section-heading">
        <div>
          <h2>История ярких моментов</h2>
          <p className="muted">Все результаты, включая отменённые розыгрыши.</p>
        </div>
        <button
          className="button secondary"
          disabled={
            !data.draws.data?.length ||
            data.participants.isPending ||
            data.prizes.isPending
          }
          onClick={() =>
            downloadCSV(`${data.event.data!.slug}-draws.csv`, [
              ["Время", "Приз", "№", "Имя", "Статус", "Кандидатов", "Режим"],
              ...(data.draws.data || []).map((d) => {
                const p = data.participants.data?.find(
                  (p) => p.id === d.participant_id,
                );
                return [
                  d.drawn_at,
                  data.prizes.data?.find((p) => p.id === d.prize_id)?.name ||
                    "",
                  p?.ticket_number ?? null,
                  p?.name || "",
                  d.status,
                  d.participants_count,
                  d.is_test ? "Тестовый" : "Основной",
                ];
              }),
            ])
          }
        >
          Экспорт CSV
        </button>
      </div>
      <ErrorNotice error={data.draws.error || data.participants.error} />
      {data.draws.isPending ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Приз</th>
                <th>Победитель</th>
                <th>Статус</th>
                <th>Кандидатов</th>
              </tr>
            </thead>
            <tbody>
              {data.draws.data?.map((d) => {
                const p = data.participants.data?.find(
                  (p) => p.id === d.participant_id,
                );
                return (
                  <tr key={d.id}>
                    <td>{formatDate(d.drawn_at)}</td>
                    <td>
                      {data.prizes.data?.find((p) => p.id === d.prize_id)
                        ?.name || "—"}
                    </td>
                    <td>
                      <strong>
                        {p
                          ? `№${formatTicket(p.ticket_number, data.event.data!.ticket_digits)} · ${p.name}`
                          : "—"}
                      </strong>
                    </td>
                    <td>
                      {d.is_test && <span className="badge">Репетиция</span>}
                      <span className={`status ${d.status}`}>
                        {d.status === "confirmed"
                          ? "Подтверждён"
                          : d.status === "pending"
                            ? "Ожидает решения"
                            : "Отменён"}
                      </span>
                    </td>
                    <td>{d.participants_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.draws.data?.length && (
            <Empty>Первые победители появятся здесь после розыгрыша.</Empty>
          )}
        </div>
      )}
    </section>
  );
}
