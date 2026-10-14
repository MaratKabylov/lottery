import { useParams } from "react-router-dom";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEventData } from "../../hooks/useEventData";
import { useAction } from "../../hooks/useAction";
import { EventNav } from "../../components/ui/EventNav";
import { ErrorNotice, Loading } from "../../components/ui/Feedback";
import {
  assetUrl,
  listEventStaffIds,
  listStaffProfiles,
  saveEvent,
  setEventStaff,
  uploadAsset,
} from "../../services/events";
import type { Event } from "../../types/database";
const toggles = [
  ["registration_enabled", "Регистрация открыта"],
  ["draw_enabled", "Розыгрыш разрешён"],
  ["require_phone", "Обязательный телефон"],
  ["require_email", "Обязательный email"],
  ["check_in_required", "Только присутствующие участвуют"],
  ["allow_multiple_wins", "Разрешить повторный выигрыш"],
  ["random_prize_assignment", "Назначать приз случайно"],
  ["show_participant_name", "Показывать имя победителя"],
  ["show_ticket_number", "Показывать номер билета"],
  ["confetti_enabled", "Конфетти на большом экране"],
  ["sound_enabled", "Звук на большом экране"],
] as const;
export default function SettingsPage() {
  const { eventId = "" } = useParams();
  const data = useEventData(eventId);
  const client = useQueryClient();
  const action = useAction();
  const coadmins = useQuery({
    queryKey: ["staff-profiles", "coadmin"],
    queryFn: () => listStaffProfiles("coadmin"),
  });
  const hosts = useQuery({
    queryKey: ["staff-profiles", "host"],
    queryFn: () => listStaffProfiles("host"),
  });
  const assignedStaff = useQuery({
    queryKey: ["event-staff", eventId],
    queryFn: () => listEventStaffIds(eventId),
    enabled: Boolean(eventId),
  });
  if (data.event.isPending) return <Loading />;
  if (!data.event.data) return <ErrorNotice error={data.event.error} />;
  const event = data.event.data;
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values: Partial<Event> = {
      name: String(form.get("name")).trim(),
      slug: String(form.get("slug")).trim(),
      description: String(form.get("description")).trim() || null,
      status: String(form.get("status")) as Event["status"],
      primary_color: String(form.get("primary_color")),
      ticket_digits: Number(form.get("ticket_digits")),
      draw_animation_seconds: Number(form.get("draw_animation_seconds")),
    };
    for (const [key] of toggles) values[key] = form.get(key) === "on";
    void action.run(
      async () => {
        const file = form.get("logo");
        if (file instanceof File && file.size)
          values.logo_path = await uploadAsset(eventId, file, "logo");
        return saveEvent(values, eventId);
      },
      () => {
        void client.invalidateQueries({ queryKey: ["event", eventId] });
        void client.invalidateQueries({ queryKey: ["events"] });
      },
    );
  }
  return (
    <section className="workspace">
      <EventNav event={event} />
      <form
        className="panel form-grid"
        key={event.updated_at}
        onSubmit={submit}
      >
        <h2 className="full">Детали мероприятия</h2>
        <label>
          Название
          <input
            name="name"
            required
            maxLength={200}
            defaultValue={event.name}
          />
        </label>
        <label>
          Адрес
          <input
            name="slug"
            required
            maxLength={200}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            defaultValue={event.slug}
          />
        </label>
        <label className="full">
          Описание
          <textarea
            name="description"
            rows={3}
            defaultValue={event.description || ""}
          />
        </label>
        <label>
          Статус
          <select name="status" defaultValue={event.status}>
            <option value="draft">Черновик</option>
            <option value="active">Активно</option>
            <option value="finished">Завершено</option>
            <option value="archived">В архиве</option>
          </select>
        </label>
        <label>
          Основной цвет
          <input
            type="color"
            name="primary_color"
            defaultValue={event.primary_color}
          />
        </label>
        <label>
          Логотип
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
          />
          {event.logo_path && (
            <img
              className="logo-preview"
              src={assetUrl(event.logo_path)}
              alt="Текущий логотип"
            />
          )}
        </label>
        <label>
          Длительность анимации (сек.)
          <input
            name="draw_animation_seconds"
            type="number"
            required
            min={1}
            max={15}
            defaultValue={event.draw_animation_seconds}
          />
        </label>
        <label>
          Минимум цифр в билете
          <input
            name="ticket_digits"
            type="number"
            min={1}
            max={8}
            required
            defaultValue={event.ticket_digits}
          />
        </label>
        <h2 className="full form-divider">Правила и оформление</h2>
        {toggles.map(([key, label]) => (
          <label className="checkbox-label" key={key}>
            <input name={key} type="checkbox" defaultChecked={event[key]} />
            {label}
          </label>
        ))}
        <div className="full">
          <ErrorNotice error={action.error} />
          <button className="button" disabled={action.pending}>
            {action.pending ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        </div>
      </form>
      <section className="panel">
        <h2>Соадминистраторы мероприятия</h2>
        <p className="muted">
          Соадминистраторы имеют полный доступ к этому мероприятию: настройкам,
          участникам, призам, истории и команде.
        </p>
        <ErrorNotice error={coadmins.error || assignedStaff.error} />
        {coadmins.isPending || assignedStaff.isPending ? (
          <Loading />
        ) : !coadmins.data?.length ? (
          <p className="muted">Профили с ролью coadmin пока не добавлены.</p>
        ) : (
          <div className="form-grid">
            {coadmins.data.map((coadmin) => {
              const assigned = assignedStaff.data?.includes(coadmin.id) ?? false;
              return (
                <label className="checkbox-label" key={coadmin.id}>
                  <input
                    type="checkbox"
                    checked={assigned}
                    onChange={(change) => {
                      const enabled = change.currentTarget.checked;
                      void action.run(
                        () => setEventStaff(eventId, coadmin.id, enabled),
                        () => {
                          void client.invalidateQueries({
                            queryKey: ["event-staff", eventId],
                          });
                        },
                      );
                    }}
                  />
                  {coadmin.display_name || coadmin.id}
                </label>
              );
            })}
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Ведущие мероприятия</h2>
        <p className="muted">
          Назначенные ведущие увидят только это мероприятие и смогут проводить
          розыгрыш, но не менять его настройки.
        </p>
        <ErrorNotice error={hosts.error || assignedStaff.error} />
        {hosts.isPending || assignedStaff.isPending ? (
          <Loading />
        ) : !hosts.data?.length ? (
          <p className="muted">Профили с ролью host пока не добавлены.</p>
        ) : (
          <div className="form-grid">
            {hosts.data.map((host) => {
              const assigned = assignedStaff.data?.includes(host.id) ?? false;
              return (
                <label className="checkbox-label" key={host.id}>
                  <input
                    type="checkbox"
                    checked={assigned}
                    onChange={(change) => {
                      const enabled = change.currentTarget.checked;
                      void action.run(
                        () => setEventStaff(eventId, host.id, enabled),
                        () => {
                          void client.invalidateQueries({
                            queryKey: ["event-staff", eventId],
                          });
                        },
                      );
                    }}
                  />
                  {host.display_name || host.id}
                </label>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
