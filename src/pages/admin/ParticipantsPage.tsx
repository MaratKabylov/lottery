import { useParams } from "react-router-dom";
import { useState } from "react";
import { Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEventData } from "../../hooks/useEventData";
import { useAction } from "../../hooks/useAction";
import { EventNav } from "../../components/ui/EventNav";
import { ErrorNotice, Loading, Empty } from "../../components/ui/Feedback";
import {
  checkIn,
  setParticipantActive,
  manageTestParticipants,
} from "../../services/participants";
import { formatTicket, formatDate } from "../../utils/format";
import { downloadCSV } from "../../utils/export";
export default function ParticipantsPage() {
  const { eventId = "" } = useParams();
  const data = useEventData(eventId, true);
  const client = useQueryClient();
  const action = useAction();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [testCount, setTestCount] = useState(10);
  if (data.event.isPending) return <Loading />;
  if (!data.event.data) return <ErrorNotice error={data.event.error} />;
  const winners = new Set(
    data.draws.data
      ?.filter((d) => d.status === "confirmed" && !d.is_test)
      .map((d) => d.participant_id),
  );
  const rows = (data.participants.data || [])
    .filter((p) =>
      `${p.name} ${p.phone || ""} ${p.email || ""} ${formatTicket(p.ticket_number)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .filter(
      (p) =>
        filter === "all" ||
        (filter === "present" && p.checked_in) ||
        (filter === "absent" && !p.checked_in) ||
        (filter === "active" && p.is_active) ||
        (filter === "disabled" && !p.is_active) ||
        (filter === "winner" && winners.has(p.id)),
    );
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["event", eventId] });
  };
  return (
    <section className="workspace">
      <EventNav event={data.event.data} />
      <div className="toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Поиск участников"
            placeholder="Имя, телефон или номер"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Фильтр участников"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            ["all", "Все"],
            ["present", "Присутствуют"],
            ["absent", "Не пришли"],
            ["active", "Активные"],
            ["disabled", "Отключённые"],
            ["winner", "Победители"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="button-row" style={{ marginBottom: 20 }}>
        <button
          className="button secondary compact"
          disabled={data.participants.isPending || !rows.length}
          onClick={() =>
            downloadCSV(`${data.event.data!.slug}-${filter}.csv`, [
              [
                "№",
                "Имя",
                "Телефон",
                "Email",
                "Присутствует",
                "Активен",
                "Тестовый",
                "Дата регистрации",
              ],
              ...rows.map((p) => [
                p.ticket_number,
                p.name,
                p.phone,
                p.email,
                p.checked_in,
                p.is_active,
                p.is_test,
                p.created_at,
              ]),
            ])
          }
        >
          Экспорт выборки CSV
        </button>
        <select
          style={{ width: 100, minHeight: 36, padding: 8 }}
          aria-label="Количество тестовых участников"
          value={testCount}
          onChange={(e) => setTestCount(Number(e.target.value))}
        >
          {[10, 50, 100, 500].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          className="button secondary compact"
          disabled={action.pending}
          onClick={() =>
            void action.run(
              () => manageTestParticipants(eventId, testCount),
              refresh,
            )
          }
        >
          Добавить тестовых
        </button>
        <button
          className="text-link small"
          disabled={action.pending}
          onClick={() =>
            void action.run(
              () => manageTestParticipants(eventId, 0, true),
              refresh,
            )
          }
        >
          Удалить тестовых
        </button>
      </div>
      <ErrorNotice error={action.error || data.participants.error} />
      {data.participants.isPending ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>№</th>
                <th>Гость</th>
                <th>Контакты</th>
                <th>Регистрация</th>
                <th>Присутствие</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="ticket-cell">
                    {formatTicket(
                      p.ticket_number,
                      data.event.data!.ticket_digits,
                    )}
                  </td>
                  <td>
                    <strong>{p.name}</strong>
                    {p.is_test && <small>Тестовый</small>}
                    {winners.has(p.id) && <small>🏆 Победитель</small>}
                  </td>
                  <td>
                    {p.phone || "—"}
                    <small>{p.email}</small>
                  </td>
                  <td>{formatDate(p.created_at)}</td>
                  <td>
                    <button
                      className={`pill ${p.checked_in ? "positive" : ""}`}
                      disabled={action.pending}
                      onClick={() =>
                        void action.run(
                          () =>
                            checkIn(eventId, p.ticket_number, !p.checked_in),
                          refresh,
                        )
                      }
                    >
                      {p.checked_in ? "✓ Пришёл" : "Отметить"}
                    </button>
                  </td>
                  <td>
                    <button
                      className={`pill ${p.is_active ? "positive" : ""}`}
                      disabled={action.pending}
                      onClick={() =>
                        void action.run(
                          () => setParticipantActive(p.id, !p.is_active),
                          refresh,
                        )
                      }
                    >
                      {p.is_active ? "Активен" : "Отключён"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <Empty>
              Участники не найдены. Поделитесь QR-кодом регистрации.
            </Empty>
          )}
        </div>
      )}
    </section>
  );
}
