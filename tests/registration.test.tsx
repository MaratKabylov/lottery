import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RegistrationPage from "../src/pages/public/RegistrationPage";
import Success from "../src/pages/public/RegistrationSuccessPage";
const mocks = vi.hoisted(() => ({ register: vi.fn(), getEvent: vi.fn() }));
vi.mock("../src/services/participants", () => ({
  registerParticipant: mocks.register,
}));
vi.mock("../src/services/events", () => ({
  getPublicEvent: mocks.getEvent,
  assetUrl: () => undefined,
}));
const event = {
  id: "event",
  slug: "opening",
  name: "Открытие",
  require_phone: true,
  require_email: false,
  status: "active",
  registration_enabled: true,
  ticket_digits: 3,
  check_in_required: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEvent.mockResolvedValue(event);
});
function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={["/event/opening/register"]}>
        <Routes>
          <Route
            path="/event/:eventSlug/register"
            element={<RegistrationPage />}
          />
          <Route path="/event/:eventSlug/success" element={<Success />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByLabelText("Ваше имя");
  await user.type(screen.getByLabelText("Ваше имя"), "Дана");
  await user.type(screen.getByLabelText("Телефон"), "+77011234567");
}
describe("public registration", () => {
  it("submits to the Edge service and displays the server-issued ticket", async () => {
    mocks.register.mockResolvedValue({
      success: true,
      ticket_number: 143,
      participant_id: "p",
      already_registered: false,
    });
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: /Получить номер/ }));
    expect(await screen.findByText("№143")).toBeTruthy();
    expect(mocks.register).toHaveBeenCalledWith({
      event_slug: "opening",
      name: "Дана",
      phone: "+77011234567",
      email: "",
    });
    expect(sessionStorage.getItem("receipt:opening")).toContain("143");
  });
  it("duplicate registration displays the original ticket", async () => {
    mocks.register.mockResolvedValue({
      success: true,
      ticket_number: 57,
      participant_id: "p",
      already_registered: true,
    });
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: /Получить номер/ }));
    expect(await screen.findByText("№057")).toBeTruthy();
    expect(screen.getByText("ВЫ УЖЕ С НАМИ")).toBeTruthy();
  });
  it("shows server errors and allows retry without inventing a ticket", async () => {
    mocks.register.mockRejectedValue(new Error("Регистрация закрыта"));
    const user = setup();
    await fill(user);
    await user.click(screen.getByRole("button", { name: /Получить номер/ }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Регистрация закрыта",
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: /Получить номер/ })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(sessionStorage.getItem("receipt:opening")).toBeNull();
  });
  it("closed events never expose a registration form", async () => {
    mocks.getEvent.mockResolvedValue({ ...event, registration_enabled: false });
    setup();
    expect(await screen.findByText("Регистрация закрыта")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Получить номер/ })).toBeNull();
  });
});
