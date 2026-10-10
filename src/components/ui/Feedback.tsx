import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { message } from "../../utils/format";

export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="notice error" role="alert">
      {message(error)}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} /> Загружаем данные…
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Connection({
  status,
}: {
  status: "online" | "reconnecting" | "offline";
}) {
  return (
    <span className={`connection ${status}`} role="status">
      <i />
      {status === "online"
        ? "Онлайн"
        : status === "reconnecting"
          ? "Переподключение"
          : "Нет соединения"}
    </span>
  );
}
