import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScreenPage from "../src/pages/public/ScreenPage";
const mock = vi.hoisted(() => ({
  confetti: vi.fn(),
  remaining: 0,
  snapshot: {
    event: {
      name: "Открытие",
      slug: "opening",
      primary_color: "#163c32",
      confetti_enabled: true,
      sound_enabled: false,
      ticket_digits: 3,
      status: "active",
      registration_enabled: true,
      screen_banner_enabled: false,
      screen_banner_path: null as string | null,
    },
    state: { mode: "waiting", current_draw_id: null as string | null, rehearsal_mode: false },
    participant_count: 10,
    winner: null as null | {
      name: string;
      ticket_number: number;
      status: string;
    },
    prize: null as null | { name: string; image_path: null },
  },
}));
vi.mock("../src/hooks/useEventData", () => ({
  useScreen: () => ({ data: mock.snapshot, connection: "online" }),
}));
vi.mock("../src/hooks/useCountdown", () => ({ useCountdown: () => mock.remaining }));
vi.mock("../src/services/events", () => ({ assetUrl: (path: string | null) => path ? `/assets/${path}` : undefined }));
vi.mock("canvas-confetti", () => ({ default: mock.confetti }));
vi.mock("../src/components/ui/RegistrationQR", () => ({
  RegistrationQR: () => null,
}));
it("splits the screen only when advertising is enabled and restores the full screen when disabled", () => {
  const previous = mock.snapshot;
  mock.snapshot = {
    ...previous,
    state: { mode: "waiting", current_draw_id: null, rehearsal_mode: false },
    event: { ...previous.event, screen_banner_enabled: false, screen_banner_path: "banner.webp" },
  };
  const view = render(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(view.container.querySelector(".big-screen-split")).toBeNull();
  expect(screen.queryByRole("complementary", { name: "Рекламный баннер" })).toBeNull();
  mock.snapshot.event.screen_banner_enabled = true;
  for (const mode of ["waiting", "countdown", "drawing", "winner", "paused"]) {
    mock.snapshot.state.mode = mode;
    view.rerender(<MemoryRouter><ScreenPage /></MemoryRouter>);
    expect(view.container.querySelector(".big-screen-split")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Рекламный баннер мероприятия" }).getAttribute("src")).toBe("/assets/banner.webp");
  }
  mock.snapshot.event.screen_banner_enabled = false;
  view.rerender(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(view.container.querySelector(".big-screen-split")).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();
  mock.snapshot = previous;
});
it("keeps the full screen when an enabled snapshot has no banner", () => {
  const previous = mock.snapshot;
  mock.snapshot = { ...previous, event: { ...previous.event, screen_banner_enabled: true, screen_banner_path: null } };
  const view = render(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(view.container.querySelector(".big-screen-split")).toBeNull();
  expect(screen.queryByRole("complementary")).toBeNull();
  mock.snapshot = previous;
});
it("marks a rehearsal winner and explains that no real prize is awarded", () => {
  const previous = mock.snapshot;
  mock.snapshot = {
    ...previous,
    state: { mode: "winner", current_draw_id: "rehearsal-draw", rehearsal_mode: true },
    winner: { name: "Тестовый гость", ticket_number: 1, status: "confirmed" },
  };
  render(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(screen.getByText("ТЕСТОВЫЙ РОЗЫГРЫШ · РЕПЕТИЦИЯ")).toBeTruthy();
  expect(screen.getByText("Результат репетиции — приз не выдаётся")).toBeTruthy();
  mock.snapshot = previous;
  mock.confetti.mockClear();
});
it("screen renders a fresh database snapshot and celebrates the server-selected winner once", () => {
  const view = render(
    <MemoryRouter>
      <ScreenPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("10")).toBeTruthy();
  mock.snapshot = { ...mock.snapshot, participant_count: 11 };
  view.rerender(
    <MemoryRouter>
      <ScreenPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("11")).toBeTruthy();
  mock.snapshot = {
    ...mock.snapshot,
    state: { mode: "drawing", current_draw_id: "draw", rehearsal_mode: false },
    winner: { name: "Дана", ticket_number: 83, status: "pending" },
    prize: { name: "Бесплатный курс", image_path: null },
  };
  view.rerender(
    <MemoryRouter>
      <ScreenPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("№083")).toBeTruthy();
  expect(screen.getByText("Дана")).toBeTruthy();
  expect(mock.confetti).toHaveBeenCalledTimes(1);
  mock.snapshot = {
    ...mock.snapshot,
    winner: { ...mock.snapshot.winner!, status: "confirmed" },
  };
  view.rerender(
    <MemoryRouter>
      <ScreenPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("Ваш подарок ждёт вас!")).toBeTruthy();
  expect(mock.confetti).toHaveBeenCalledTimes(1);
});
it("pause and countdown hide stale winners and countdown waits for the host to start", () => {
  mock.confetti.mockClear();
  mock.snapshot = { ...mock.snapshot, state: { mode: "paused", current_draw_id: "stale-draw", rehearsal_mode: false } };
  const view = render(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(screen.getByText("Небольшая пауза")).toBeTruthy();
  expect(screen.queryByText("Дана")).toBeNull();
  expect(mock.confetti).not.toHaveBeenCalled();
  mock.snapshot = { ...mock.snapshot, state: { mode: "countdown", current_draw_id: null, rehearsal_mode: false } };
  mock.remaining = 2500;
  view.rerender(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(screen.getByRole("timer").textContent).toBe("3");
  expect(screen.queryByText("Дана")).toBeNull();
  mock.remaining = 0;
  view.rerender(<MemoryRouter><ScreenPage /></MemoryRouter>);
  expect(screen.getByText("Ждём старта от ведущего")).toBeTruthy();
  expect(mock.confetti).not.toHaveBeenCalled();
});
