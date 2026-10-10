import { useEffect, useRef, useState } from "react";
import { loadTurnstile, type TurnstileApi } from "../../lib/turnstile";
import { ErrorNotice } from "./Feedback";

export function Turnstile({ siteKey, onToken }: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    let disposed = false;
    let api: TurnstileApi | undefined;
    let widgetId: string | undefined;
    onToken(null);
    setError(null);
    setVerified(false);
    const clear = (message: string) => {
      if (disposed) return;
      onToken(null);
      setVerified(false);
      setError(new Error(message));
    };
    void loadTurnstile().then((loaded) => {
      if (disposed || !container.current) return;
      api = loaded;
      widgetId = api.render(container.current, {
        sitekey: siteKey,
        size: "flexible",
        language: "ru",
        "response-field": false,
        callback: (token) => {
          if (disposed) return;
          setError(null);
          setVerified(true);
          onToken(token);
        },
        "expired-callback": () => clear("Срок проверки истёк. Пройдите её ещё раз."),
        "timeout-callback": () => clear("Время проверки истекло. Попробуйте ещё раз."),
        "error-callback": () => clear("Не удалось пройти проверку. Попробуйте ещё раз."),
      });
    }).catch(() => clear("Не удалось загрузить проверку. Попробуйте ещё раз."));
    return () => {
      disposed = true;
      if (widgetId !== undefined) api?.remove(widgetId);
    };
  }, [siteKey, onToken, attempt]);
  return (
    <div className="registration-verification">
      <div ref={container} />
      <p className="small muted" role="status">
        {verified ? "Проверка пройдена" : "Пройдите проверку перед регистрацией"}
      </p>
      <ErrorNotice error={error} />
      {Boolean(error) && (
        <button type="button" className="button secondary" onClick={() => setAttempt((value) => value + 1)}>
          Повторить проверку
        </button>
      )}
    </div>
  );
}
