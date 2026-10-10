import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Maximize, Volume2 } from "lucide-react";
import confetti from "canvas-confetti";
import { useScreen } from "../../hooks/useEventData";
import { useCountdown } from "../../hooks/useCountdown";
import { assetUrl } from "../../services/events";
import { formatTicket } from "../../utils/format";
import { RegistrationQR } from "../../components/ui/RegistrationQR";
import { Connection, ErrorNotice, Loading } from "../../components/ui/Feedback";
export default function ScreenPage() {
  const { eventSlug = "" } = useParams();
  const screen = useScreen(eventSlug);
  const remaining = useCountdown(
    screen.data?.state.countdown_end,
    screen.data?.server_time,
    screen.dataUpdatedAt,
  );
  const [controls, setControls] = useState(true);
  const [sound, setSound] = useState(false);
  const [controlError, setControlError] = useState<unknown>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const celebrated = useRef<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const drawing = Boolean(
    screen.data?.state.mode === "drawing" && remaining > 0,
  );
  const winner = Boolean(
    screen.data?.winner && screen.data.state.mode !== "waiting" && !drawing,
  );
  const drawId = screen.data?.state.current_draw_id;
  useEffect(() => {
    if (!winner || !drawId || celebrated.current === drawId) return;
    celebrated.current = drawId;
    if (screen.data?.event.confetti_enabled)
      void confetti({
        particleCount: 130,
        spread: 85,
        origin: { y: 0.65 },
        colors: ["#e2bd74", "#fcfaf2", "#76bba6"],
        disableForReducedMotion: true,
      });
    if (sound && screen.data?.event.sound_enabled && audio.current) {
      const context = audio.current;
      [523.25, 659.25, 783.99].forEach((frequency, i) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.frequency.value = frequency;
        const t = context.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        oscillator.start(t);
        oscillator.stop(t + 0.5);
      });
    }
  }, [
    winner,
    drawId,
    screen.data?.event.confetti_enabled,
    screen.data?.event.sound_enabled,
    sound,
  ]);
  useEffect(() => {
    hideTimer.current = window.setTimeout(() => setControls(false), 3500);
    return () => {
      window.clearTimeout(hideTimer.current);
      void audio.current?.close();
    };
  }, []);
  function showControls() {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 3500);
  }
  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (e) {
      setControlError(e);
    }
  }
  async function enableSound() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSound(!sound);
    } catch (e) {
      setControlError(e);
    }
  }
  if (screen.isPending) return <Loading />;
  if (!screen.data) return <ErrorNotice error={screen.error} />;
  const { event, prize, state, participant_count } = screen.data;
  return (
    <main
      className="big-screen"
      style={{ "--event-color": event.primary_color } as CSSProperties}
      onPointerMove={showControls}
      onKeyDown={showControls}
      onTouchStart={showControls}
    >
      <div className="screen-orbit orbit-one" />
      <div className="screen-orbit orbit-two" />
      <header className="screen-header">
        {event.logo_path ? (
          <img src={assetUrl(event.logo_path)} alt={event.name} />
        ) : (
          <span className="screen-brand">✳ EventDraw.</span>
        )}
        <Connection status={screen.connection} />
      </header>
      <section className="screen-content">
        <span className="eyebrow">{event.name}</span>
        {drawing ? (
          <>
            <h1>
              Ваш счастливый
              <br />
              момент близко
            </h1>
            <span className="drawing-star">✳</span>
            <div className="screen-countdown">
              {Math.ceil(remaining / 1000)}
            </div>
            <p>{prize?.name}</p>
          </>
        ) : winner ? (
          <>
            <span className="winner-label">ПОЗДРАВЛЯЕМ ПОБЕДИТЕЛЯ</span>
            {screen.data.winner?.ticket_number !== null && (
              <div className="winner-ticket">
                №
                {formatTicket(
                  screen.data.winner!.ticket_number!,
                  event.ticket_digits,
                )}
              </div>
            )}
            {screen.data.winner?.name && (
              <h1 className="winner-name">{screen.data.winner.name}</h1>
            )}
            <h2>{prize?.name}</h2>
            {prize?.image_path && (
              <img
                className="screen-prize"
                src={assetUrl(prize.image_path)}
                alt={prize.name}
              />
            )}
            <p className="winner-hint">
              {screen.data.winner?.status === "confirmed"
                ? "Ваш подарок ждёт вас!"
                : "Подойдите к ведущему"}
            </p>
          </>
        ) : state.mode === "paused" ? (
          <>
            <h1>Небольшая пауза</h1>
            <p>Скоро продолжим.</p>
          </>
        ) : (
          <>
            <h1>
              Этот момент
              <br />
              <em>может стать вашим.</em>
            </h1>
            <p>Присоединяйтесь к розыгрышу подарков</p>
            {event.status === "active" && event.registration_enabled && (
              <RegistrationQR slug={event.slug} />
            )}
            <div className="participant-counter">
              <strong>{participant_count}</strong> участников уже с нами
            </div>
          </>
        )}
      </section>
      <div
        className={`screen-controls ${controls ? "visible" : ""}`}
        onFocus={() => setControls(true)}
      >
        <button className="button glass" onClick={() => void fullScreen()}>
          <Maximize size={17} /> На весь экран
        </button>
        {event.sound_enabled && (
          <button className="button glass" onClick={() => void enableSound()}>
            <Volume2 size={17} />
            {sound ? "Выключить звук" : "Включить звук"}
          </button>
        )}
      </div>
      <div className="screen-errors">
        <ErrorNotice error={screen.error || controlError} />
      </div>
      <footer className="screen-footer">
        МАЛЕНЬКИЕ НОМЕРА. БОЛЬШИЕ МОМЕНТЫ.
      </footer>
    </main>
  );
}
