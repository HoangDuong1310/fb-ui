/**
 * Helper định dạng số/giá/ngày theo locale Việt Nam.
 */

const numberFmt = new Intl.NumberFormat("vi-VN");

/** Định dạng số nguyên có phân tách hàng nghìn: 1234567 → "1.234.567". */
export function fmtNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numberFmt.format(value);
}

/** Định dạng giá VND: 1500000 → "1.500.000 ₫". */
export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${numberFmt.format(value)} ₫`;
}

/** Định dạng ngày giờ: ISO → "22/06/2026 09:48". */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Rút gọn text dài, thêm "…" khi vượt quá max. */
export function truncate(text: string | null | undefined, max = 120): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
