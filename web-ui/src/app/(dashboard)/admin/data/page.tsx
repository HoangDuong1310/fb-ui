"use client";

/**
 * Trang sửa dữ liệu (chỉ admin).
 *
 * Backend cho phép xem/sửa/xóa một danh sách trắng bảng (ADMIN_DATA_TABLES):
 * - GET    /api/admin/data/:table        → { table, rows }  (tối đa 500 dòng)
 * - PATCH  /api/admin/data/:table/:id     { <cột cho phép> }
 * - DELETE /api/admin/data/:table/:id
 *
 * Mỗi bảng chỉ cho sửa đúng các cột trong whitelist; UI dưới đây bám theo đó.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/lib/use-api";
import { apiFetch, ApiError } from "@/lib/api";
import { truncate } from "@/lib/format";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type Row = Record<string, unknown>;

interface FieldSpec {
  /** Tên cột trong DB (khớp whitelist backend). */
  col: string;
  label: string;
  type: "text" | "number" | "bool";
}

interface TableSpec {
  key: string;
  label: string;
  /** Cột id để hiển thị và làm key. */
  idCol: string;
  /** Các cột hiển thị trong bảng (chỉ đọc + sửa). */
  columns: { col: string; label: string }[];
  /** Các trường được phép sửa (khớp ADMIN_DATA_TABLES.editable). */
  editable: FieldSpec[];
}

const TABLES: TableSpec[] = [
  {
    key: "posts",
    label: "Bài viết",
    idCol: "post_id",
    columns: [
      { col: "post_id", label: "ID" },
      { col: "group_name", label: "Nhóm" },
      { col: "author_name", label: "Tác giả" },
      { col: "text", label: "Nội dung" },
    ],
    editable: [
      { col: "text", label: "Nội dung", type: "text" },
      { col: "share_crawled", label: "Chia sẻ", type: "bool" },
    ],
  },
  {
    key: "groups",
    label: "Nhóm",
    idCol: "group_id",
    columns: [
      { col: "group_id", label: "ID" },
      { col: "group_name", label: "Tên nhóm" },
    ],
    editable: [{ col: "group_name", label: "Tên nhóm", type: "text" }],
  },
  {
    key: "comments",
    label: "Bình luận",
    idCol: "id",
    columns: [
      { col: "id", label: "ID" },
      { col: "post_id", label: "Bài" },
      { col: "content", label: "Nội dung" },
    ],
    editable: [
      { col: "content", label: "Nội dung", type: "text" },
      { col: "share_commented", label: "Chia sẻ", type: "bool" },
    ],
  },
  {
    key: "group_prices",
    label: "Giá",
    idCol: "id",
    columns: [
      { col: "id", label: "ID" },
      { col: "name", label: "Sản phẩm" },
      { col: "price", label: "Giá" },
    ],
    editable: [
      { col: "name", label: "Tên sản phẩm", type: "text" },
      { col: "price", label: "Giá", type: "number" },
      { col: "share_group_prices", label: "Chia sẻ", type: "bool" },
    ],
  },
];

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return String(v);
  return truncate(String(v), 80);
}

export default function AdminDataPage() {
  const [active, setActive] = useState<string>(TABLES[0].key);
  const spec = useMemo(
    () => TABLES.find((t) => t.key === active) ?? TABLES[0],
    [active],
  );

  const { data, error, loading, reload } = useApi<{ table: string; rows: Row[] }>(
    `/api/admin/data/${spec.key}`,
  );

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Khởi tạo form khi mở dialog sửa.
  useEffect(() => {
    if (!editRow) return;
    const init: Record<string, string> = {};
    for (const f of spec.editable) {
      const v = editRow[f.col];
      init[f.col] =
        f.type === "bool"
          ? v ? "1" : "0"
          : v === null || v === undefined
            ? ""
            : String(v);
    }
    setForm(init);
  }, [editRow, spec]);

  const rows = data?.rows ?? [];

  async function saveEdit() {
    if (!editRow) return;
    const id = editRow[spec.idCol];
    const body: Record<string, unknown> = {};
    for (const f of spec.editable) {
      const raw = form[f.col];
      if (f.type === "bool") body[f.col] = raw === "1" ? 1 : 0;
      else if (f.type === "number") body[f.col] = raw === "" ? null : Number(raw);
      else body[f.col] = raw;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/admin/data/${spec.key}/${id}`, {
        method: "PATCH",
        body,
      });
      toast.success("Đã lưu thay đổi.");
      setEditRow(null);
      reload();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Lưu không thành công.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete[spec.idCol];
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/data/${spec.key}/${id}`, { method: "DELETE" });
      toast.success("Đã xóa bản ghi.");
      setToDelete(null);
      reload();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Xóa không thành công.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sửa dữ liệu"
        description="Xem, chỉnh sửa và xóa dữ liệu đã thu thập (tối đa 500 dòng gần nhất mỗi bảng)."
      />

      <Tabs value={active} onValueChange={setActive} className="mb-4">
        <TabsList>
          {TABLES.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Không có dữ liệu"
          description="Bảng này hiện chưa có bản ghi nào."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {spec.columns.map((c) => (
                  <TableHead key={c.col}>{c.label}</TableHead>
                ))}
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={String(r[spec.idCol])}>
                  {spec.columns.map((c) => (
                    <TableCell
                      key={c.col}
                      className={
                        c.col === spec.idCol
                          ? "tabular text-muted-foreground"
                          : undefined
                      }
                    >
                      {cellText(r[c.col])}
                    </TableCell>
                  ))}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditRow(r)}
                      >
                        Sửa
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setToDelete(r)}
                      >
                        Xóa
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog sửa */}
      <Dialog
        open={editRow !== null}
        onOpenChange={(open) => !open && setEditRow(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa bản ghi</DialogTitle>
            <DialogDescription>
              {spec.label} · ID {editRow ? String(editRow[spec.idCol]) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {spec.editable.map((f) => (
              <div key={f.col} className="space-y-2">
                <Label htmlFor={`f-${f.col}`}>{f.label}</Label>
                {f.type === "bool" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      id={`f-${f.col}`}
                      type="checkbox"
                      checked={form[f.col] === "1"}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          [f.col]: e.target.checked ? "1" : "0",
                        }))
                      }
                    />
                    Cho phép chia sẻ với người dùng khác
                  </label>
                ) : (
                  <Input
                    id={`f-${f.col}`}
                    type={f.type === "number" ? "number" : "text"}
                    value={form[f.col] ?? ""}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, [f.col]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditRow(null)}
              disabled={saving}
            >
              Hủy
            </Button>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog xóa */}
      <Dialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa bản ghi?</DialogTitle>
            <DialogDescription>
              Bản ghi {spec.label} · ID{" "}
              {toDelete ? String(toDelete[spec.idCol]) : ""} sẽ bị xóa vĩnh viễn.
              Hành động này không thể hoàn tác.
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
              {deleting ? "Đang xóa…" : "Xóa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
