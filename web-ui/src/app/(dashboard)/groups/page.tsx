"use client";

/**
 * Trang Nhóm — danh sách nhóm Facebook đã thu thập + số bài mỗi nhóm.
 *
 * Gọi GET /api/groups → { groups:[{ groupId, groupName, postCount, ... }] }.
 * Có ô tìm kiếm lọc theo tên/ID nhóm (lọc phía client).
 */

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtNumber, fmtDateTime } from "@/lib/format";
import type { GroupsResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export default function GroupsPage() {
  const { data, error, loading, reload } =
    useApi<GroupsResponse>("/api/groups");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const groups = data?.groups ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter(
      (g) =>
        (g.groupName ?? "").toLowerCase().includes(term) ||
        g.groupId.toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="Nhóm"
        description="Các nhóm Facebook đã thu thập dữ liệu."
      />

      <div className="mb-4 max-w-xs">
        <Input
          placeholder="Tìm theo tên hoặc ID nhóm…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Không có nhóm nào"
          description="Chưa thu thập nhóm nào, hoặc không khớp từ khóa tìm kiếm."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên nhóm</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-right">Số bài</TableHead>
                <TableHead>Cập nhật</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((g) => (
                <TableRow key={g.groupId}>
                  <TableCell className="font-medium">
                    {g.groupName || "(không tên)"}
                  </TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {g.groupId}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {fmtNumber(g.postCount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDateTime(g.updatedAt)}
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
