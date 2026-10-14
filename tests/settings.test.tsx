import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SettingsPage from "../src/pages/admin/SettingsPage";

const mocks = vi.hoisted(() => ({
  save: vi.fn(), upload: vi.fn(),
  event: {
    id: "event", name: "Открытие", slug: "opening", status: "active",
    primary_color: "#163c32", ticket_digits: 3, draw_animation_seconds: 4,
    updated_at: "2026-10-14", screen_banner_enabled: false,
    screen_banner_path: null as string | null,
  },
}));
vi.mock("../src/hooks/useEventData", () => ({
  useEventData: () => ({ event: { data: mocks.event } }),
}));
vi.mock("../src/services/events", () => ({
  saveEvent: mocks.save, uploadAsset: mocks.upload,
  assetUrl: (path: string | null) => path ? `/assets/${path}` : undefined,
  listStaffProfiles: async () => [], listEventStaffIds: async () => [], setEventStaff: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.event.screen_banner_enabled = false;
  mocks.event.screen_banner_path = null;
  mocks.save.mockResolvedValue(mocks.event);
  mocks.upload.mockResolvedValue("events/event/screen-banner.webp");
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:banner-preview");
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/admin/events/event/settings"]}>
        <Routes><Route path="/admin/events/:eventId/settings" element={<SettingsPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), invalidate };
}
const toggle = () => screen.getByRole("checkbox", { name: "Разделить экран и показывать рекламный баннер" });
const save = () => screen.getByRole("button", { name: "Сохранить настройки" });
function submitWithFile(file: File) {
  // jsdom does not include userEvent's file list in native validity or FormData.
  const get = FormData.prototype.get;
  vi.spyOn(FormData.prototype, "get").mockImplementation(function (this: FormData, key: string) {
    return key === "screen_banner" ? file : get.call(this, key);
  });
  fireEvent.submit(save().closest("form")!);
}

it("requires a banner for first activation, uploads it and refreshes screens after saving", async () => {
  const { user, invalidate } = setup();
  await user.click(toggle());
  const input = screen.getByLabelText("Рекламный баннер") as HTMLInputElement;
  expect(input.required).toBe(true);
  await user.click(save());
  expect(mocks.save).not.toHaveBeenCalled();
  const file = new File(["banner"], "ad.webp", { type: "image/webp" });
  await user.upload(input, file);
  expect(screen.getByRole("img", { name: "Предпросмотр рекламного баннера" }).getAttribute("src")).toBe("blob:banner-preview");
  submitWithFile(file);
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
    screen_banner_enabled: true, screen_banner_path: "events/event/screen-banner.webp",
  }), "event"));
  expect(mocks.upload).toHaveBeenCalledWith("event", file, "screen-banner");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["screen"] });
});
it("disables advertising without removing the saved banner and can enable it again without an upload", async () => {
  mocks.event.screen_banner_enabled = true;
  mocks.event.screen_banner_path = "existing.webp";
  const { user } = setup();
  expect((screen.getByLabelText("Рекламный баннер") as HTMLInputElement).required).toBe(false);
  await user.click(toggle());
  await user.click(save());
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ screen_banner_enabled: false }), "event"));
  expect(mocks.save.mock.calls[0][0]).not.toHaveProperty("screen_banner_path");
  await user.click(toggle());
  await user.click(save());
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ screen_banner_enabled: true }), "event"));
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("keeps the previous settings if a replacement upload fails", async () => {
  mocks.event.screen_banner_enabled = true;
  mocks.event.screen_banner_path = "existing.webp";
  mocks.upload.mockRejectedValueOnce(new Error("Выберите PNG, JPEG или WebP до 5 МБ"));
  const { user } = setup();
  const file = new File(["new"], "new.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("Рекламный баннер"), file);
  submitWithFile(file);
  expect((await screen.findByRole("alert")).textContent).toContain("до 5 МБ");
  expect(mocks.save).not.toHaveBeenCalled();
  expect(save().hasAttribute("disabled")).toBe(false);
});
it("also rejects activation without an image when form submission bypasses browser validation", async () => {
  const { user } = setup();
  await user.click(toggle());
  fireEvent.submit(save().closest("form")!);
  expect((await screen.findByRole("alert")).textContent).toContain("Загрузите рекламный баннер");
  expect(mocks.save).not.toHaveBeenCalled();
});
