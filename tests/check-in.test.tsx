import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CheckInPage from "../src/pages/public/CheckInPage";

const mocks = vi.hoisted(() => ({ ticket: vi.fn(), phone: vi.fn(), event: vi.fn() }));
vi.mock("../src/services/participants", () => ({ checkIn: mocks.ticket, checkInByPhone: mocks.phone }));
vi.mock("../src/services/events", () => ({ getPublicEvent: mocks.event }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.event.mockResolvedValue({ id: "event", name: "Открытие", ticket_digits: 4 });
  mocks.ticket.mockResolvedValue({ name: "Дана", ticket_number: 57, checked_in: true });
  mocks.phone.mockResolvedValue({ name: "Дана", ticket_number: 57, checked_in: true });
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/event/opening/check-in"]}><Routes><Route path="/event/:eventSlug/check-in" element={<CheckInPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return { user: userEvent.setup(), invalidate };
}
describe("staff check-in", () => {
  it("marks a ticket present and refreshes event and screen data", async () => {
    const { user, invalidate } = setup();
    await user.type(await screen.findByLabelText("Номер"), "57");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Дана · №0057 — присутствие отмечено")).toBeTruthy();
    expect(mocks.ticket).toHaveBeenCalledWith("event", 57, true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["event", "event"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["screen", "opening"] });
  });
  it("sends the phone to the protected service for server normalization", async () => {
    const { user } = setup();
    await user.selectOptions(await screen.findByLabelText("Найти участника"), "phone");
    await user.type(screen.getByLabelText("Телефон"), "8 (701) 123-45-67");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/присутствие отмечено/)).toBeTruthy();
    expect(mocks.phone).toHaveBeenCalledWith("event", "8 (701) 123-45-67", true);
    expect(mocks.ticket).not.toHaveBeenCalled();
  });
  it("cancels attendance by phone", async () => {
    mocks.phone.mockResolvedValue({ name: "Дана", ticket_number: 57, checked_in: false });
    const { user } = setup();
    await user.selectOptions(await screen.findByLabelText("Найти участника"), "phone");
    await user.type(screen.getByLabelText("Телефон"), "+77011234567");
    await user.selectOptions(screen.getByLabelText("Действие"), "absent");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/отметка присутствия отменена/)).toBeTruthy();
    expect(mocks.phone).toHaveBeenCalledWith("event", "+77011234567", false);
  });
  it("clears the previous success before a failed attempt and permits retry", async () => {
    const { user } = setup();
    await user.type(await screen.findByLabelText("Номер"), "57");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText(/присутствие отмечено/);
    mocks.ticket.mockRejectedValueOnce(new Error("Участник не найден"));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Участник не найден");
    expect(screen.queryByText(/присутствие отмечено/)).toBeNull();
    expect(screen.getByRole("button", { name: "Сохранить" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText(/присутствие отмечено/)).toBeTruthy();
  });
  it("locks the form while a request is pending", async () => {
    mocks.ticket.mockReturnValue(new Promise(() => {}));
    const { user } = setup();
    await user.type(await screen.findByLabelText("Номер"), "57");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    for (const label of ["Номер", "Действие", "Найти участника"]) expect(screen.getByLabelText(label).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Сохраняем…" }).hasAttribute("disabled")).toBe(true);
    expect(mocks.ticket).toHaveBeenCalledTimes(1);
  });
});
