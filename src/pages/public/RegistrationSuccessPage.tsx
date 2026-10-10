import { useLocation, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Brand } from "../../components/ui/Brand";
import { getPublicEvent } from "../../services/events";
import { formatTicket } from "../../utils/format";
import type { RegistrationResult } from "../../types/database";
function readReceipt(slug: string): RegistrationResult | null {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`receipt:${slug}`) || "null",
    );
    if (
      value &&
      typeof value === "object" &&
      "ticket_number" in value &&
      typeof value.ticket_number === "number" &&
      "success" in value &&
      value.success === true
    )
      return value as RegistrationResult;
  } catch {
    /* Missing receipt */
  }
  return null;
}
export default function RegistrationSuccessPage() {
  const { eventSlug = "" } = useParams();
  const location = useLocation();
  const receipt: RegistrationResult | null =
    location.state || readReceipt(eventSlug);
  const event = useQuery({
    queryKey: ["public-event", eventSlug],
    queryFn: () => getPublicEvent(eventSlug),
  });
  return (
    <main className="public-shell">
      <Brand />
      <article className="public-card success-card">
        {receipt ? (
          <>
            <span className="success-check">
              <Check size={28} />
            </span>
            <span className="eyebrow">
              {receipt.already_registered
                ? "ВЫ УЖЕ С НАМИ"
                : "ВЫ УЧАСТВУЕТЕ В РОЗЫГРЫШЕ"}
            </span>
            <h1>
              Ваш счастливый
              <br />
              номер
            </h1>
            <div className="success-ticket">
              №{formatTicket(receipt.ticket_number, event.data?.ticket_digits)}
            </div>
            <p>
              Сохраните этот экран.
              <br />
              Когда услышите свой номер — подойдите к ведущему.
            </p>
            {event.data?.check_in_required && (
              <div className="notice">
                Для участия отметьте присутствие у организатора.
              </div>
            )}
            <p>
              <strong>Желаем удачи!</strong>
            </p>
          </>
        ) : (
          <>
            <h1>Получите ваш номер</h1>
            <p>
              Билет не найден в этом браузере. Повторная регистрация с тем же
              телефоном вернёт прежний номер.
            </p>
            <Link className="button" to={`/event/${eventSlug}/register`}>
              Открыть регистрацию
            </Link>
          </>
        )}
      </article>
    </main>
  );
}
