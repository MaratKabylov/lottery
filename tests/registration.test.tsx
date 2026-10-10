import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import RegistrationPage from "../src/pages/public/RegistrationPage";
import Success from "../src/pages/public/RegistrationSuccessPage";
import type { TurnstileOptions } from "../src/lib/turnstile";
const mocks = vi.hoisted(() => ({ register: vi.fn(), getEvent: vi.fn(), load: vi.fn(), render: vi.fn(), remove: vi.fn() }));
vi.mock("../src/lib/turnstile", () => ({ loadTurnstile: mocks.load }));
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
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
  mocks.load.mockResolvedValue({ render: mocks.render, remove: mocks.remove });
  mocks.render.mockReturnValue("widget");
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
  it("requires verification, clears expired tokens, and sends the fresh token to Edge", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-site-key");
    mocks.register.mockResolvedValue({ success: true, ticket_number: 1, participant_id: "p", already_registered: false });
    const user = setup();
    await fill(user);
    const button = screen.getByRole("button", { name: /Получить номер/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    await user.click(button);
    expect(mocks.register).not.toHaveBeenCalled();
    const options = mocks.render.mock.calls[0][1] as TurnstileOptions;
    act(() => options.callback("expired-token"));
    expect(button.hasAttribute("disabled")).toBe(false);
    act(() => options["expired-callback"]());
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Срок проверки истёк. Пройдите её ещё раз.");
    act(() => options.callback("fresh-token"));
    await user.click(button);
    expect(await screen.findByText("№001")).toBeTruthy();
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ turnstile_token: "fresh-token" }));
    expect(mocks.remove).toHaveBeenCalledWith("widget");
  });
  it("obtains a new token after a failed registration without losing form fields", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-site-key");
    mocks.register.mockRejectedValueOnce(new Error("Попробуйте позже"));
    const user = setup();
    await fill(user);
    const options = mocks.render.mock.calls[0][1] as TurnstileOptions;
    act(() => options.callback("used-token"));
    await user.click(screen.getByRole("button", { name: /Получить номер/ }));
    expect(await screen.findByText("Попробуйте позже")).toBeTruthy();
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Ваше имя")).toHaveProperty("value", "Дана");
    expect(screen.getByRole("button", { name: /Получить номер/ }).hasAttribute("disabled")).toBe(true);
    // A callback from the removed widget cannot restore its consumed token.
    act(() => options.callback("used-token"));
    expect(screen.getByRole("button", { name: /Получить номер/ }).hasAttribute("disabled")).toBe(true);
    const retryOptions = mocks.render.mock.calls[1][1] as TurnstileOptions;
    act(() => retryOptions.callback("retry-token"));
    mocks.register.mockResolvedValue({ success: true, ticket_number: 2, participant_id: "p", already_registered: false });
    await user.click(screen.getByRole("button", { name: /Получить номер/ }));
    expect(await screen.findByText("№002")).toBeTruthy();
    expect(mocks.register).toHaveBeenLastCalledWith(expect.objectContaining({ turnstile_token: "retry-token" }));
  });
  it("allows retry when the verification script fails to load", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "public-site-key");
    mocks.load.mockRejectedValueOnce(new Error("Network error"));
    const user = setup();
    await fill(user);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Не удалось загрузить проверку. Попробуйте ещё раз.");
    expect(screen.getByRole("button", { name: /Получить номер/ }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Повторить проверку" }));
    await waitFor(() => expect(mocks.render).toHaveBeenCalledTimes(1));
    act(() => (mocks.render.mock.calls[0][1] as TurnstileOptions)["error-callback"]());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Не удалось пройти проверку. Попробуйте ещё раз.");
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
