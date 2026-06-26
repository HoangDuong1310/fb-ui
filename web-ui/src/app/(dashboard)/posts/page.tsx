"use client";

/**
 * Trang Bài viết — danh sách bài đã thu thập từ các nhóm (lọc theo chia sẻ).
 *
 * Gọi GET /api/posts → { posts:[{ postId, groupName, authorName, text,
 * permalink, timestamp, crawledAt, ... }] }.
 * Có ô tìm kiếm lọc theo nội dung/tác giả/nhóm (lọc phía client).
 * Mỗi bài có nút "AI phân tích" → gọi POST /api/ai/analyze → hiển thị kết quả.
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import { fmtDateTime, truncate } from "@/lib/format";
import type { PostsResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Shape returned by POST /api/ai/analyze (analyzePost in server/web/ai.js)
interface AnalyzeResult {
  ok?: boolean;
  reply: string;
  confidence: string;
  needsHumanCheck: boolean;
  checkNote?: string | null;
  usedProducts: Array<{
    productId: string;
    name: string;
    price: number | null;
    store?: string | null;
  }>;
  intent?: string | null;
  needs?: string | null;
  budget?: number | null;
  postId?: string | null;
}

function fmtPrice(v: number | null | undefined): string {
  if (!v) return "";
  return v.toLocaleString("vi-VN") + "₫";
}

function confidenceLabel(c: string): string {
  if (c === "high") return "Cao";
  if (c === "medium") return "Trung bình";
  return "Thấp";
}

function confidenceCls(c: string): string {
  if (c === "high")
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (c === "medium")
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

export default function PostsPage() {
  const { data, error, loading, reload } = useApi<PostsResponse>("/api/posts");
  const [q, setQ] = useState("");

  // Per-post analyze state
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [editedReply, setEditedReply] = useState("");

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

  const handleAnalyze = useCallback(
    async (
      postId: string,
      text: string,
      permalink?: string | null,
      authorName?: string | null,
    ) => {
      if (analyzingId) return;
      setAnalyzingId(postId);
      try {
        const result = await apiFetch<AnalyzeResult>("/api/ai/analyze", {
          method: "POST",
          body: {
            post: {
              postId,
              text,
              url: permalink ?? undefined,
              author: authorName ?? undefined,
            },
          },
        });
        setAnalyzeResult(result);
        setEditedReply(result.reply ?? "");
        setDialogOpen(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Lỗi không xác định";
        toast.error("Phân tích thất bại: " + msg);
      } finally {
        setAnalyzingId(null);
      }
    },
    [analyzingId],
  );

  const handleCopy = useCallback(() => {
    if (!editedReply) return;
    navigator.clipboard.writeText(editedReply).then(() => {
      toast.success("Đã sao chép nội dung tư vấn.");
    });
  }, [editedReply]);

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
                <TableHead className="w-[38%]">Nội dung</TableHead>
                <TableHead>Tác giả</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="w-[120px] text-right">Thao tác</TableHead>
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
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={analyzingId === p.postId}
                      onClick={() =>
                        handleAnalyze(
                          p.postId,
                          p.text ?? "",
                          p.permalink,
                          p.authorName,
                        )
                      }
                    >
                      {analyzingId === p.postId ? "Đang phân tích…" : "AI phân tích"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Analyze result dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kết quả phân tích AI</DialogTitle>
            {analyzeResult && (
              <DialogDescription asChild>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidenceCls(analyzeResult.confidence)}`}
                  >
                    Độ tin cậy: {confidenceLabel(analyzeResult.confidence)}
                  </span>
                  {analyzeResult.needsHumanCheck && (
                    <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                      ⚠ Cần kiểm tra thủ công
                    </span>
                  )}
                </div>
              </DialogDescription>
            )}
          </DialogHeader>

          {analyzeResult?.checkNote && (
            <p className="rounded-md bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
              {analyzeResult.checkNote}
            </p>
          )}

          {analyzeResult && analyzeResult.usedProducts.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Sản phẩm tư vấn:
              </p>
              <ul className="space-y-0.5">
                {analyzeResult.usedProducts.map((prod, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate">{prod.name}</span>
                    {prod.price ? (
                      <span className="ml-2 shrink-0 font-medium text-foreground">
                        {fmtPrice(prod.price)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Nội dung tư vấn:
            </p>
            <textarea
              className="min-h-[140px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              placeholder="Nội dung tư vấn do AI soạn…"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Đóng
            </Button>
            <Button onClick={handleCopy} disabled={!editedReply.trim()}>
              Sao chép
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
