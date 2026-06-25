"use client";

/**
 * Trang "Lệnh từ Web" — gửi lệnh điều khiển extension từ web và theo dõi trạng thái.
 *
 * - GET /api/remote-commands → danh sách lệnh ({ commands, total, page, limit }).
 * - POST /api/remote-commands body { type, payload } → tạo lệnh mới (pending).
 *   Server push lệnh qua WebSocket real-time ngay lập tức (nếu extension đang
 *   kết nối). Nếu service worker đang ngủ, extension sẽ nhận lệnh qua poll (~30s)
 *   làm fallback. Extension cập nhật trạng thái (running/completed/failed) về server.
 *
 * Có 7 loại lệnh, mỗi loại có form trường nhập riêng (xem FIELD_SPECS).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, RefreshCw, Zap } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { RemoteCommand, RemoteCommandsResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

/** Nhãn tiếng Việt cho loại lệnh (đồng bộ với dashboard extension). */
const TYPE_LABEL: Record<string, string> = {
  create_post: "Đăng bài",
  create_comment: "Bình luận",
  crawl_group: "Crawl nhóm",
  scan_groups: "Quét nhóm",
  approve_advisory: "Duyệt tư vấn",
  approve_conversation: "Duyệt hội thoại",
  delete_post: "Xoá bài",
};

/** Nhãn + màu cho trạng thái lệnh. */
const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ xử lý",
  running: "Đang chạy",
  completed: "Hoàn thành",
  failed: "Lỗi",
  expired: "Hết hạn",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  running: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  failed: "bg-red-500/15 text-red-400 border-red-500/30",
  expired: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

type FieldType = "text" | "number" | "textarea" | "checkbox";

interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  /** Giá trị mặc định cho number/checkbox. */
  default?: string | boolean;
}

/** Trường nhập theo từng loại lệnh (khớp payload mà extension mong đợi). */
const FIELD_SPECS: Record<string, FieldSpec[]> = {
  create_post: [
    { key: "content", label: "Nội dung bài viết", type: "textarea", required: true, placeholder: "Nội dung muốn đăng…" },
    { key: "groupId", label: "ID nhóm (bỏ trống nếu đăng lên trang cá nhân)", type: "text", placeholder: "Ví dụ: 123456789" },
    { key: "postToProfile", label: "Đăng lên trang cá nhân", type: "checkbox", default: false },
  ],
  create_comment: [
    { key: "targetUrl", label: "URL bài viết cần bình luận", type: "text", required: true, placeholder: "https://facebook.com/…" },
    { key: "content", label: "Nội dung bình luận", type: "textarea", required: true, placeholder: "Nội dung bình luận…" },
    { key: "groupName", label: "Tên nhóm (tuỳ chọn)", type: "text" },
  ],
  crawl_group: [
    { key: "groupId", label: "ID nhóm", type: "text", required: true, placeholder: "Ví dụ: 123456789" },
    { key: "maxScrolls", label: "Số lần cuộn tối đa", type: "number", default: "30" },
    { key: "maxPosts", label: "Số bài tối đa", type: "number", default: "50" },
    { key: "minDelay", label: "Trễ tối thiểu (ms)", type: "number", default: "1500" },
    { key: "maxDelay", label: "Trễ tối đa (ms)", type: "number", default: "3000" },
  ],
  scan_groups: [],
  approve_advisory: [
    { key: "postId", label: "ID bài viết tư vấn", type: "text", required: true },
  ],
  approve_conversation: [
    { key: "conversationId", label: "ID hội thoại", type: "text", required: true },
    { key: "reply", label: "Nội dung trả lời (tuỳ chọn)", type: "textarea", placeholder: "Để trống nếu dùng nội dung đã soạn…" },
  ],
  delete_post: [
    { key: "postUrl", label: "URL bài viết cần xoá", type: "text", required: true, placeholder: "https://facebook.com/…" },
  ],
};

const TYPE_OPTIONS = Object.keys(FIELD_SPECS);

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE[status] ?? STATUS_STYLE.expired;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Tóm tắt payload thành 1 dòng ngắn để hiển thị trong bảng. */
function summarizePayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "—";
  const parts = Object.entries(payload)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => {
      const text = typeof v === "string" ? v : JSON.stringify(v);
      const short = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      return `${k}: ${short}`;
    });
  return parts.length ? parts.join(" · ") : "—";
}

/** Khởi tạo state form rỗng theo spec của loại lệnh. */
function initFormState(type: string): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const f of FIELD_SPECS[type] ?? []) {
    if (f.type === "checkbox") out[f.key] = (f.default as boolean) ?? false;
    else out[f.key] = (f.default as string) ?? "";
  }
  return out;
}

/** Dựng payload gửi server từ state form (ép kiểu number, bỏ trường rỗng). */
function buildPayload(
  type: string,
  state: Record<string, string | boolean>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const f of FIELD_SPECS[type] ?? []) {
    const raw = state[f.key];
    if (f.type === "checkbox") {
      if (raw) payload[f.key] = true;
    } else if (f.type === "number") {
      const s = String(raw).trim();
      if (s !== "") payload[f.key] = Number(s);
    } else {
      const s = String(raw).trim();
      if (s !== "") payload[f.key] = s;
    }
  }
  return payload;
}

export default function RemoteCommandsPage() {
  const { data, error, loading, reload } =
    useApi<RemoteCommandsResponse>("/api/remote-commands");

  const [type, setType] = useState<string>(TYPE_OPTIONS[0]);
  const [form, setForm] = useState<Record<string, string | boolean>>(() =>
    initFormState(TYPE_OPTIONS[0]),
  );
  const [submitting, setSubmitting] = useState(false);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const autoRefreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRefreshEnd = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fields = FIELD_SPECS[type] ?? [];

  /* ── Auto-refresh: after sending a command, poll every 3 s for up to 30 s ── */
  const startAutoRefresh = useCallback(() => {
    if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current);
    if (autoRefreshEnd.current) clearTimeout(autoRefreshEnd.current);

    setAutoRefreshing(true);
    autoRefreshTimer.current = setInterval(() => {
      reload();
    }, 3_000);
    autoRefreshEnd.current = setTimeout(() => {
      if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current);
      autoRefreshEnd.current = null;
      autoRefreshTimer.current = null;
      setAutoRefreshing(false);
      reload(); // final refresh
    }, 30_000);
  }, [reload]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      if (autoRefreshTimer.current) clearInterval(autoRefreshTimer.current);
      if (autoRefreshEnd.current) clearTimeout(autoRefreshEnd.current);
    };
  }, []);

  const commands = useMemo<RemoteCommand[]>(
    () => data?.commands ?? [],
    [data],
  );

  /* Stop early when all visible commands reached a terminal state */
  useEffect(() => {
    if (!autoRefreshing || commands.length === 0) return;
    const allTerminal = commands.every(
      (c) =>
        c.status === "completed" ||
        c.status === "failed" ||
        c.status === "expired",
    );
    if (allTerminal && autoRefreshTimer.current) {
      clearInterval(autoRefreshTimer.current);
      if (autoRefreshEnd.current) clearTimeout(autoRefreshEnd.current);
      autoRefreshTimer.current = null;
      autoRefreshEnd.current = null;
      setAutoRefreshing(false);
    }
  }, [commands, autoRefreshing]);

  function onTypeChange(next: string) {
    setType(next);
    setForm(initFormState(next));
  }

  function setField(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Kiểm tra trường bắt buộc phía client.
    for (const f of fields) {
      if (f.required && !String(form[f.key] ?? "").trim()) {
        toast.error(`Vui lòng nhập: ${f.label}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = buildPayload(type, form);
      await apiFetch("/api/remote-commands", {
        method: "POST",
        body: { type, payload },
      });
      toast.success(`Đã gửi lệnh "${TYPE_LABEL[type] ?? type}".`);
      setForm(initFormState(type));
      reload();
      startAutoRefresh();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Không gửi được lệnh.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Lệnh từ Web"
        description="Gửi lệnh điều khiển extension từ web. Lệnh được push real-time qua WebSocket (hoặc poll ~30s nếu extension chưa kết nối)."
        actions={
          <div className="flex items-center gap-2">
            {autoRefreshing && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                <Zap aria-hidden className="size-3 animate-pulse" />
                Đang theo dõi
              </span>
            )}
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw aria-hidden className={loading ? "animate-spin" : ""} />
              Làm mới
            </Button>
          </div>
        }
      />

      <div className="mb-6 rounded-[var(--radius-lg)] border border-border p-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="cmd-type">Loại lệnh</Label>
            <Select value={type} onValueChange={onTypeChange}>
              <SelectTrigger id="cmd-type">
                <SelectValue placeholder="Chọn loại lệnh" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Lệnh này không cần tham số. Nhấn “Gửi lệnh” để thực thi.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <div
                  key={f.key}
                  className={`space-y-1.5 ${
                    f.type === "textarea" ? "sm:col-span-2" : ""
                  }`}
                >
                  {f.type === "checkbox" ? (
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-border"
                        checked={Boolean(form[f.key])}
                        onChange={(e) => setField(f.key, e.target.checked)}
                      />
                      {f.label}
                    </label>
                  ) : (
                    <>
                      <Label htmlFor={`f-${f.key}`}>
                        {f.label}
                        {f.required ? (
                          <span className="text-red-400"> *</span>
                        ) : null}
                      </Label>
                      {f.type === "textarea" ? (
                        <textarea
                          id={`f-${f.key}`}
                          className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          placeholder={f.placeholder}
                          value={String(form[f.key] ?? "")}
                          onChange={(e) => setField(f.key, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={`f-${f.key}`}
                          type={f.type === "number" ? "number" : "text"}
                          placeholder={f.placeholder}
                          value={String(form[f.key] ?? "")}
                          onChange={(e) => setField(f.key, e.target.value)}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <Button type="submit" disabled={submitting}>
              <Send aria-hidden />
              {submitting ? "Đang gửi…" : "Gửi lệnh"}
            </Button>
          </div>
        </form>
      </div>

      <h2
        className="mb-3 text-sm font-semibold text-muted-foreground"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Lịch sử lệnh
      </h2>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : commands.length === 0 ? (
        <EmptyState
          title="Chưa có lệnh nào"
          description="Gửi lệnh đầu tiên bằng form phía trên."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loại</TableHead>
                <TableHead>Tham số</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Tạo lúc</TableHead>
                <TableHead>Hoàn thành</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commands.map((cmd) => (
                <TableRow key={cmd.id}>
                  <TableCell className="font-medium">
                    {TYPE_LABEL[cmd.type] ?? cmd.type}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {cmd.error ? (
                      <span className="text-red-400">{cmd.error}</span>
                    ) : (
                      summarizePayload(cmd.payload)
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cmd.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDateTime(cmd.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cmd.completedAt ? fmtDateTime(cmd.completedAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
