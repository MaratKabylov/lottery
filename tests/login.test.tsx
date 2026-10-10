import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import LoginPage from "../src/pages/admin/LoginPage";

const mock = vi.hoisted(() => ({
  auth: { session: null as null | { user: { id: string } }, profile: null, loading: false, error: null },
  signIn: vi.fn(),
}));
vi.mock("../src/app/providers/AuthProvider", () => ({ useAuth: () => mock.auth }));
vi.mock("../src/lib/supabase", () => ({ supabase: { auth: { signInWithPassword: mock.signIn } } }));
beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.session = null;
  mock.auth.loading = false;
  mock.signIn.mockResolvedValue({ error: null });
});
afterEach(() => vi.useRealTimers());
function setup() {
  return render(<MemoryRouter initialEntries={["/login"]}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/events" element={<div>Staff access check</div>} />
    </Routes>
  </MemoryRouter>);
}
function submit() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "admin@example.test" } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "test-password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Войти" }).closest("form")!);
}
it("routes authenticated users without a profile to the staff access check instead of silently staying on login", () => {
  mock.auth.session = { user: { id: "no-profile" } };
  setup();
  expect(screen.getByText("Staff access check")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Войти" })).toBeNull();
});
it("shows a pending label and a visible server error, then allows a retry", async () => {
  let resolve!: (result: unknown) => void;
  mock.signIn.mockImplementation(() => new Promise((done) => { resolve = done; }));
  setup();
  submit();
  expect(screen.getByRole("button", { name: "Входим…" }).hasAttribute("disabled")).toBe(true);
  await act(async () => { resolve({ error: new Error("Invalid login credentials") }); });
  expect(screen.getByRole("alert").textContent).toContain("Invalid login credentials");
  expect(screen.getByRole("button", { name: "Войти" }).hasAttribute("disabled")).toBe(false);
});
it("explains session/profile loading while the button is disabled", () => {
  mock.auth.loading = true;
  setup();
  expect(screen.getByRole("button", { name: "Проверяем доступ…" }).hasAttribute("disabled")).toBe(true);
});
it("ends an unresponsive sign-in with a visible timeout instead of an endless disabled button", async () => {
  vi.useFakeTimers();
  mock.signIn.mockImplementation(() => new Promise(() => {}));
  setup();
  submit();
  await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
  expect(screen.getByRole("alert").textContent).toContain("Сервер не ответил вовремя");
  expect(screen.getByRole("button", { name: "Войти" }).hasAttribute("disabled")).toBe(false);
});
