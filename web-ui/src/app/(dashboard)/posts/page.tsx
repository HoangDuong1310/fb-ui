"use client";

/**
 * Trang Bài viết — danh sách bài đã thu thập từ các nhóm (lọc theo chia sẻ).
 *
 * Gọi GET /api/posts → { posts:[{ postId, groupName, authorName, text,
 * permalink, timestamp, crawledAt, ... }] }.
 * Có ô tìm kiếm lọc theo nội dung/tác giả/nhóm (lọc phía client).
 */

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtDateTime, truncate } from "@/lib/format";
import type { PostsResponse } from "@/lib/types";
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

export default function PostsPage() {
  const { data, error, loading, reload } = useApi<PostsResponse>("/api/posts");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const posts = data?.posts ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter(
      (p) =>
        (p.text ?? "").toLowerCase().includes(term) ||
        (p.authorName ?? "").toLowerCase().includes(term) ||
        (p.groupName ?? "").toLowerCase().includes(term),
    );
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="Bài viết"
        description="Các bài viết đã thu thập từ những nhóm bạn theo dõi."
      />

      <div className="mb-4 max-w-xs">
        <Input
          placeholder="Tìm theo nội dung, tác giả, nhóm…"
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
          title="Chưa có bài viết nào"
          description="Chưa thu thập bài viết nào, hoặc không khớp từ khóa tìm kiếm."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44%]">Nội dung</TableHead>
                <TableHead>Tác giả</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.postId}>
                  <TableCell className="font-medium">
                    {p.permalink ? (
                      <a
                        href={p.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {truncate(p.text, 120) || "(không có nội dung)"}
                      </a>
                    ) : (
                      truncate(p.text, 120) || "(không có nội dung)"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.authorName || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.groupName || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDateTime(p.timestamp ?? p.crawledAt)}
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
