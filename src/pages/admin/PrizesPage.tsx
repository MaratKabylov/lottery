import { useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { Plus, Gift, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEventData } from "../../hooks/useEventData";
import { useAction } from "../../hooks/useAction";
import { EventNav } from "../../components/ui/EventNav";
import { ErrorNotice, Loading, Empty } from "../../components/ui/Feedback";
import { savePrize, deletePrize } from "../../services/prizes";
import { assetUrl, uploadAsset } from "../../services/events";
import type { Prize } from "../../types/database";
export default function PrizesPage() {
  const { eventId = "" } = useParams();
  const data = useEventData(eventId);
  const client = useQueryClient();
  const action = useAction();
  const [editing, setEditing] = useState<Prize | "new" | null>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["event", eventId] });
  };
  if (data.event.isPending) return <Loading />;
  if (!data.event.data) return <ErrorNotice error={data.event.error} />;
  const current = editing && editing !== "new" ? editing : null;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void action.run(
      async () => {
        const prize = await savePrize(
          {
            event_id: eventId,
            name: String(form.get("name")).trim(),
            description: String(form.get("description")).trim() || null,
            quantity: Number(form.get("quantity")),
            is_active: form.get("active") === "on",
            sort_order: current?.sort_order ?? (data.prizes.data?.length || 0),
          },
          current?.id,
        );
        const file = form.get("image");
        if (file instanceof File && file.size) {
          const path = await uploadAsset(eventId, file, `prizes/${prize.id}`);
          await savePrize({ image_path: path }, prize.id);
        }
      },
      () => {
        setEditing(null);
        refresh();
      },
    );
  }
  async function move(prize: Prize, direction: number) {
    const rows = data.prizes.data || [];
    const index = rows.findIndex((p) => p.id === prize.id);
    const other = rows[index + direction];
    if (!other) return;
    // Assign spaced values without relying on duplicate sort_order values.
    for (let i = 0; i < rows.length; i++) {
      const item =
        i === index ? other : i === index + direction ? prize : rows[i];
      await savePrize({ sort_order: i * 10 }, item.id);
    }
  }
  return (
    <section className="workspace">
      <EventNav event={data.event.data} />
      <div className="section-heading">
        <div>
          <h2>Подарки для ваших гостей</h2>
          <p className="muted">
            Выберите порядок розыгрыша и количество экземпляров.
          </p>
        </div>
        <button className="button" onClick={() => setEditing("new")}>
          <Plus size={17} /> Добавить приз
        </button>
      </div>
      <ErrorNotice error={action.error || data.prizes.error} />
      {editing && (
        <form
          className="panel form-grid"
          key={current?.id || "new"}
          onSubmit={submit}
        >
          <label>
            Название
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={current?.name}
            />
          </label>
          <label>
            Количество
            <input
              name="quantity"
              type="number"
              required
              min={1}
              defaultValue={current?.quantity || 1}
            />
          </label>
          <label className="full">
            Описание
            <textarea
              name="description"
              defaultValue={current?.description || ""}
            />
          </label>
          <label>
            Изображение
            <input
              type="file"
              name="image"
              accept="image/png,image/jpeg,image/webp"
            />
          </label>
          <label className="checkbox-label">
            <input
              name="active"
              type="checkbox"
              defaultChecked={current?.is_active ?? true}
            />{" "}
            Участвует в розыгрыше
          </label>
          <div className="full button-row">
            <button className="button" disabled={action.pending}>
              Сохранить
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setEditing(null)}
            >
              Отмена
            </button>
          </div>
        </form>
      )}
      {data.prizes.isPending ? (
        <Loading />
      ) : (
        <div className="prize-grid">
          {data.prizes.data?.map((p, i) => {
            const awarded =
              data.draws.data?.filter(
                (d) => d.prize_id === p.id && d.status === "confirmed",
              ).length || 0;
            return (
              <article
                className={`prize-card ${!p.is_active ? "inactive" : ""}`}
                key={p.id}
              >
                <div className="prize-art">
                  {p.image_path ? (
                    <img src={assetUrl(p.image_path)} alt={p.name} />
                  ) : (
                    <Gift size={44} strokeWidth={1.25} />
                  )}
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className="prize-body">
                  <h3>{p.name}</h3>
                  <p>
                    {p.description || "Особенный подарок для счастливого гостя"}
                  </p>
                  <div className="progress">
                    <i
                      style={{
                        width: `${Math.min(100, (awarded / p.quantity) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="small">
                    Выдано {awarded} из {p.quantity}
                    {!p.is_active ? " · Отключён" : ""}
                  </p>
                  <div className="button-row">
                    <button
                      className="button secondary compact"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil size={14} /> Изменить
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Выше"
                      disabled={i === 0 || action.pending}
                      onClick={() =>
                        void action.run(() => move(p, -1), refresh)
                      }
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Ниже"
                      disabled={
                        i === (data.prizes.data?.length || 0) - 1 ||
                        action.pending
                      }
                      onClick={() => void action.run(() => move(p, 1), refresh)}
                    >
                      <ArrowDown size={16} />
                    </button>
                    {p.is_active && (
                      <button
                        className="text-link small"
                        disabled={action.pending}
                        onClick={() =>
                          void action.run(() => deletePrize(p.id), refresh)
                        }
                      >
                        Отключить
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!data.prizes.isPending && !data.prizes.data?.length && (
        <Empty>
          <Gift size={32} />
          <h3>Пока нет призов</h3>
          <p>Добавьте первый подарок для ваших гостей.</p>
        </Empty>
      )}
    </section>
  );
}
