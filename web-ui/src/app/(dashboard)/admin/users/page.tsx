"use client";

/**
 * Trang quản lý người dùng (chỉ admin).
 *
 * - GET /api/admin/users → danh sách tài khoản.
 * - PATCH /api/admin/users/:id/approve — duyệt tài khoản chờ.
 * - PATCH /api/admin/users/:id/lock — khóa tài khoản.
 * - PATCH /api/admin/users/:id { status?, role? } — đổi trạng thái/vai trò.
 * - DELETE /api/admin/users/:id — xóa hẳn tài khoản.
 *
 * Backend đã chặn admin tự khóa/tự hạ quyền/tự xóa; client cũng ẩn các nút đó
 * cho chính mình để tránh thao tác thừa.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useApi } from "@/lib/use-api";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import type { AdminUser, AdminUsersResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_META: Record<
  AdminUser["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Chờ duyệt", variant: "secondary" },
  approved: { label: "Đã duyệt", variant: "default" },
  locked: { label: "Đã khóa", variant: "destructive" },
};

function initials(name: string | null, email: string): string {
  const src = (name ?? email).trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } =
    useApi<AdminUsersResponse>("/api/admin/users");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const users = data?.users ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(term) ||
        (u.displayName ?? "").toLowerCase().includes(term),
    );
  }, [data, q]);

  async function runAction(
    id: number,
    fn: () => Promise<unknown>,
    successMsg: string,
  ) {
    setBusyId(id);
    try {
      await fn();
      toast.success(successMsg);
      reload();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Có lỗi xảy ra, thử lại sau.";
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  function approve(u: AdminUser) {
    runAction(
      u.id,
      () =>
        apiFetch(`/api/admin/users/${u.id}/approve`, { method: "PATCH" }),
      "Đã duyệt tài khoản.",
    );
  }

  function lock(u: AdminUser) {
    runAction(
      u.id,
      () => apiFetch(`/api/admin/users/${u.id}/lock`, { method: "PATCH" }),
      "Đã khóa tài khoản.",
    );
  }

  function unlock(u: AdminUser) {
    runAction(
      u.id,
      () =>
        apiFetch(`/api/admin/users/${u.id}`, {
          method: "PATCH",
          body: { status: "approved" },
        }),
      "Đã mở khóa tài khoản.",
    );
  }

  function changeRole(u: AdminUser, role: AdminUser["role"]) {
    if (role === u.role) return;
    runAction(
      u.id,
      () =>
        apiFetch(`/api/admin/users/${u.id}`, {
          method: "PATCH",
          body: { role },
        }),
      role === "admin" ? "Đã cấp quyền admin." : "Đã chuyển về quyền người dùng.",
    );
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/users/${toDelete.id}`, { method: "DELETE" });
      toast.success("Đã xóa tài khoản.");
      setToDelete(null);
      reload();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Không xóa được, thử lại sau.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quản lý người dùng"
        description="Duyệt, khóa, phân quyền và xóa tài khoản trong hệ thống."
      />

      <div className="mb-4 max-w-xs">
        <Input
          placeholder="Tìm theo email hoặc tên…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Không có người dùng"
          description="Chưa có tài khoản nào khớp với tìm kiếm."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tài khoản</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const isMe = me?.id === u.id;
                const busy = busyId === u.id;
                const st = STATUS_META[u.status];
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                          {initials(u.displayName, u.email)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {u.displayName || u.email}
                            {isMe && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (bạn)
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        onValueChange={(v) =>
                          changeRole(u, v as AdminUser["role"])
                        }
                        disabled={busy || isMe}
                      >
                        <SelectTrigger className="w-32" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Người dùng</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDateTime(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" asChild>
                          <Link href={`/admin/users/${u.id}`}>Chi tiết</Link>
                        </Button>
                        {u.status === "pending" && (
                          <Button
                            size="sm"
                            onClick={() => approve(u)}
                            disabled={busy}
                          >
                            Duyệt
                          </Button>
                        )}
                        {u.status === "locked" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unlock(u)}
                            disabled={busy}
                          >
                            Mở khóa
                          </Button>
                        )}
                        {u.status !== "locked" && !isMe && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => lock(u)}
                            disabled={busy}
                          >
                            Khóa
                          </Button>
                        )}
                        {!isMe && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setToDelete(u)}
                            disabled={busy}
                          >
                            Xóa
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa tài khoản?</DialogTitle>
            <DialogDescription>
              Tài khoản{" "}
              <span className="font-medium text-foreground">
                {toDelete?.displayName || toDelete?.email}
              </span>{" "}
              sẽ bị xóa vĩnh viễn. Dữ liệu đã chia sẻ (bài viết, giá) vẫn được giữ
              lại nhưng gỡ thông tin chủ sở hữu. Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToDelete(null)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Đang xóa…" : "Xóa tài khoản"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
