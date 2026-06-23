"use client";

/**
 * useApi — hook lấy dữ liệu đơn giản cho client component.
 *
 * Trả về { data, error, loading, reload }. Tự gắn token qua apiFetch.
 * Dùng cho các trang đọc dữ liệu (overview/groups/posts/group-prices).
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

interface UseApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useApi<T = unknown>(path: string | null): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Không tải được dữ liệu.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  return { data, error, loading, reload };
}
