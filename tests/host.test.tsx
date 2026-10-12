import { it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import HostPage from "../src/pages/host/HostPage";
const mock = vi.hoisted(() => ({
  draw: vi.fn(),
  finish: vi.fn(),
  mode: "waiting",
  setMode: vi.fn(),
  setRehearsal: vi.fn(),
  rehearsal: false,
  awarded: false,
  connection: "online",
  pending: false,
  remaining: 0,
  randomPrizeAssignment: false,
}));
vi.mock("../src/hooks/useCountdown", () => ({
  useCountdown: () => mock.remaining,
}));
vi.mock("../src/services/draws", () => ({
  drawWinner: mock.draw,
  finishDraw: mock.finish,
  setScreenMode: mock.setMode,
  setRehearsalMode: mock.setRehearsal,
}));
vi.mock("../src/services/events", () => ({
  getStaffStats: async () => ({
    participants_count: 1,
    checked_in_count: 1,
    confirmed_winners_count: 0,
  }),
}));
vi.mock("../src/hooks/useEventData", () => ({
  useEventData: () => ({
    event: {
      data: {
        id: "event",
        slug: "opening",
        name: "Открытие",
        status: "active",
        draw_enabled: true,
        random_prize_assignment: mock.randomPrizeAssignment,
        ticket_digits: 3,
      },
    },
    prizes: {
      data: [
        { id: "prize", name: "Бесплатный курс", quantity: 1, is_active: true },
      ],
    },
    draws: {
      data: mock.pending
        ? [{ id: "draw", prize_id: "prize", status: "pending" }]
        : mock.awarded ? [{ id: "award", prize_id: "prize", status: "confirmed", is_test: false }] : [],
    },
    connection: mock.connection,
  }),
  useScreen: () => ({
    data: {
      state: { current_draw_id: "draw", mode: mock.mode, rehearsal_mode: mock.rehearsal },
      winner: { ticket_number: 57, name: "Дана" },
      prize: { name: "Бесплатный курс" },
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mock.connection = "online";
  mock.pending = false;
  mock.remaining = 0;
  mock.mode = "waiting";
  mock.rehearsal = false;
  mock.awarded = false;
  mock.randomPrizeAssignment = false;
  mock.setRehearsal.mockResolvedValue({ rehearsal_mode: true });
  mock.draw.mockResolvedValue({ id: "draw" });
  mock.finish.mockResolvedValue({ id: "draw" });
});
it("host sends screen commands to Supabase and validates countdown duration", async () => {
  const user = setup();
  const screenStatus = screen.getByRole("status", { name: "Текущий режим большого экрана" });
  expect(screenStatus.textContent).toContain("Сейчас включён");
  expect(screenStatus.textContent).toContain("Экран ожидания");
  await user.click(screen.getByRole("button", { name: "Пауза" }));
  expect(mock.setMode).toHaveBeenCalledWith("event", "paused");
  await user.click(screen.getByRole("button", { name: "Экран ожидания" }));
  expect(mock.setMode).toHaveBeenCalledWith("event", "waiting");
  await user.click(screen.getByRole("button", { name: "Запустить отсчёт" }));
  expect(mock.setMode).toHaveBeenCalledWith("event", "countdown", 30);
  await user.clear(screen.getByRole("spinbutton"));
  await user.type(screen.getByRole("spinbutton"), "601");
  expect(screen.getByRole("button", { name: "Запустить отсчёт" }).hasAttribute("disabled")).toBe(true);
});
it.each(["paused", "countdown"])("host blocks drawing in %s mode", async (mode) => {
  mock.mode = mode;
  mock.remaining = 1000;
  const user = setup();
  await user.selectOptions(screen.getByRole("combobox"), "prize");
  await user.click(screen.getByRole("button", { name: /Начать розыгрыш/ }));
  expect(mock.draw).not.toHaveBeenCalled();
});
it("host allows drawing after countdown ends", async () => {
  mock.mode = "countdown";
  const user = setup();
  await user.selectOptions(screen.getByRole("combobox"), "prize");
  await user.click(screen.getByRole("button", { name: /Начать розыгрыш/ }));
  expect(mock.draw).toHaveBeenCalledWith("event", "prize");
});
it("host cannot hide a pending winner with a screen command", async () => {
  mock.pending = true;
  const user = setup();
  for (const name of ["Пауза", "Экран ожидания", "Запустить отсчёт"]) {
    const button = screen.getByRole("button", { name });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(button);
  }
  expect(mock.setMode).not.toHaveBeenCalled();
});
function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/host/event"]}>
        <Routes>
          <Route path="/host/:eventId" element={<HostPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
it("host sends event and prize IDs to the server draw engine", async () => {
  const user = setup();
  await user.selectOptions(screen.getByRole("combobox"), "prize");
  await user.click(screen.getByRole("button", { name: /Начать розыгрыш/ }));
  expect(mock.draw).toHaveBeenCalledWith("event", "prize");
});
it("lets the server assign a random prize when the event setting is enabled", async () => {
  mock.randomPrizeAssignment = true;
  const user = setup();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByText(/случайно назначен сервером/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Начать розыгрыш/ }));
  expect(mock.draw).toHaveBeenCalledWith("event", null);
});
it("host cannot draw while offline", async () => {
  mock.connection = "offline";
  const user = setup();
  await user.selectOptions(screen.getByRole("combobox"), "prize");
  expect(
    screen
      .getByRole("button", { name: /Начать розыгрыш/ })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: /Начать розыгрыш/ }));
  expect(mock.draw).not.toHaveBeenCalled();
});
it("host confirms the pending draw", async () => {
  mock.pending = true;
  const user = setup();
  expect(screen.getByText("№057")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Подтвердить" }));
  expect(mock.finish).toHaveBeenCalledWith("draw", true);
});
it("host cancels an absent winner without selecting another locally", async () => {
  mock.pending = true;
  const user = setup();
  await user.click(
    screen.getByRole("button", { name: "Победитель отсутствует" }),
  );
  expect(mock.finish).toHaveBeenCalledWith("draw", false);
  expect(mock.draw).not.toHaveBeenCalled();
});
it("host waits for animation before exposing confirmation", () => {
  mock.pending = true;
  mock.remaining = 2000;
  setup();
  expect(screen.getByText("2 сек.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Подтвердить" })).toBeNull();
});

it("switches rehearsal mode through the protected RPC", async () => {
  const user = setup();
  await user.click(screen.getByRole("checkbox", { name: "Тестовый розыгрыш" }));
  expect(mock.setRehearsal).toHaveBeenCalledWith("event", true);
});

it.each(["offline", "pending"])("prevents mode changes when %s", (condition) => {
  mock.pending = condition === "pending";
  mock.connection = condition === "offline" ? "offline" : "online";
  setup();
  expect(screen.getByRole("checkbox", { name: "Тестовый розыгрыш" }).hasAttribute("disabled")).toBe(true);
});

it("allows rehearsing an exhausted prize and clearly labels the test draw", async () => {
  mock.rehearsal = true;
  mock.awarded = true;
  const user = setup();
  expect(screen.getByText(/Призы не расходуются/)).toBeTruthy();
  await user.selectOptions(screen.getByRole("combobox"), "prize");
  await user.click(screen.getByRole("button", { name: "Начать тестовый розыгрыш" }));
  expect(mock.draw).toHaveBeenCalledWith("event", "prize");
});
