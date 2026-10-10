export function downloadCSV(
  filename: string,
  rows: (string | number | boolean | null)[][],
) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          let text = String(value ?? "");
          if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
