import { NavLink, Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Event } from "../../types/database";
export function EventNav({ event }: { event: Event }) {
  const base = `/admin/events/${event.id}`;
  return (
    <>
      <Link className="back-link" to="/admin/events">
        <ArrowLeft size={15} /> Все мероприятия
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">/{event.slug}</span>
          <h1>{event.name}</h1>
        </div>
        <Link className="button" to={`/host/${event.id}`}>
          Панель ведущего <ArrowUpRight size={17} />
        </Link>
      </div>
      <nav className="event-tabs" aria-label="Разделы мероприятия">
        {[
          ["", "Обзор"],
          ["/participants", "Участники"],
          ["/prizes", "Призы"],
          ["/draws", "История"],
          ["/settings", "Настройки"],
        ].map(([path, label]) => (
          <NavLink key={path} end to={base + path}>
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
