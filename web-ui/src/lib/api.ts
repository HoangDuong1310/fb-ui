/**
 * Client API gọi tới Express backend (proxy qua /api/* trong next.config.ts).
 *
 * Mọi request tự gắn header `Authorization: Bearer <token>` nếu đã đăng nhập.
 * Token được lưu ở localStorage để giữ phiên qua các lần tải lại trang.
 */

const TOKEN_KEY = "gr_token";

/** Đọc token hiện tại từ localStorage (an toàn khi chạy phía server). */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/** Lưu token; truyền null để xóa (đăng xuất). */
export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

/** Lỗi API có kèm mã HTTP và payload gốc để tầng trên xử lý (vd 403 chờ duyệt). */
export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  /** Body dạng object sẽ tự stringify + set Content-Type. */
  body?: unknown;
};

/**
 * Gọi API và parse JSON. Tự gắn token, tự ném ApiError khi status >= 400.
 *
 * Ví dụ:
 *   const data = await apiFetch<{ groups: Group[] }>("/api/groups");
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  const token = getToken();
  if (token) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let finalBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (
      typeof body === "string" ||
      body instanceof FormData ||
      body instanceof Blob
    ) {
      finalBody = body as BodyInit;
    } else {
      finalBody = JSON.stringify(body);
      if (!finalHeaders.has("Content-Type")) {
        finalHeaders.set("Content-Type", "application/json");
      }
    }
  }

  const res = await fetch(path, { ...rest, headers: finalHeaders, body: finalBody });

  // Một số endpoint (vd DELETE) có thể trả 204 không body.
  const text = await res.text();
  const data: unknown = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    const message = extractErrorMessage(data) ?? `Lỗi ${res.status}`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(data: unknown): string | null {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.error === "string") return obj.error;
  }
  return null;
}
