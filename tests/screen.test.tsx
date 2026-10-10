import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ScreenPage from "../src/pages/public/ScreenPage";
const mock = vi.hoisted(() => ({
  confetti: vi.fn(),
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
    },
    state: { mode: "waiting", current_draw_id: null as string | null },
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
vi.mock("../src/hooks/useCountdown", () => ({ useCountdown: () => 0 }));
vi.mock("../src/services/events", () => ({ assetUrl: () => undefined }));
vi.mock("canvas-confetti", () => ({ default: mock.confetti }));
vi.mock("../src/components/ui/RegistrationQR", () => ({
  RegistrationQR: () => null,
}));
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
    state: { mode: "drawing", current_draw_id: "draw" },
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
