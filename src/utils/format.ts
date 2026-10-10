export const formatTicket = (number: number, digits = 3) =>
  String(number).padStart(digits, "0");
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "object" &&
        error &&
        "message" in error &&
        typeof error.message === "string"
      ? error.message
      : "Не удалось выполнить действие";
}
