"use client";

/**
 * Trang Bài viết — danh sách bài đã thu thập từ các nhóm (lọc theo chia sẻ).
 *
 * Tính năng:
 * - Toggle "Chỉ của tôi": gọi GET /api/posts?mine=1, ẩn bài chia sẻ từ người khác
 * - Badge "của tôi" (xanh) / "chia sẻ" (xám) trên mỗi bài
 * - Panel bình luận mở rộng: nhấn icon bình luận để xem lịch sử bình luận
 *   trên bài đó từ GET /api/posts/:id/comments (phục vụ AI né nội dung trùng)
 * - AI phân tích bài viết → dialog kết quả với nội dung tư vấn có thể chỉnh sửa
 */

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, truncate } from "@/lib/format";
import type { PostsResponse, PostCommentsResponse } from "@/lib/types";
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
import { MessageSquare, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

// Shape returned by POST /api/ai/analyze
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

/** Inline panel showing comments already made on a post — aids AI avoidance. */
function CommentsPanel({ postId }: { postId: string }) {
  const { data, error, loading, reload } =
    useApi<PostCommentsResponse>(`/api/posts/${encodeURIComponent(postId)}/comments`);

  if (loading) {
    return (
      <div className="space-y-1 py-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-destructive">
        <span>Không tải được bình luận.</span>
        <button onClick={reload} className="underline">
          Thử lại
        </button>
      </div>
    );
  }

  const comments = data?.comments ?? [];

  if (comments.length === 0) {
    return (
      <p className="py-2 text-xs text-muted-foreground italic">
        Chưa có bình luận nào được ghi nhận trên bài này.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 py-2">
      {comments.map((c) => (
        <li
          key={c.id}
          className="rounded-md bg-muted/50 px-3 py-1.5 text-xs leading-relaxed"
        >
          <span className="mr-1.5 font-medium text-foreground">
            #{c.userId ?? "?"}
          </span>
          <span className="text-muted-foreground">
            {c.commentedAt ? fmtDateTime(c.commentedAt) : ""}
          </span>
          {c.shareCommented ? (
            <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              chia sẻ
            </span>
          ) : null}
          <p className="mt-0.5 whitespace-pre-wrap text-foreground/80">
            {c.content || "(trống)"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function PostsPage() {
  const { user } = useAuth();
  const [mineOnly, setMineOnly] = useState(false);
  const apiUrl = mineOnly ? "/api/posts?mine=1" : "/api/posts";
  const { data, error, loading, reload } = useApi<PostsResponse>(apiUrl);

  const [q, setQ] = useState("");
  // Per-post analyze state
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [editedReply, setEditedReply] = useState("");
  // Expanded comments per post
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

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

  const toggleComments = useCallback((postId: string) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="Bài viết"
        description="Các bài viết đã thu thập từ những nhóm bạn theo dõi."
        actions={
          <div className="flex items-center gap-2">
            {/* Mine-only toggle */}
            <button
              onClick={() => setMineOnly((v) => !v)}
              className={`
                inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium
                transition-colors
                ${mineOnly
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"}
              `}
            >
              {mineOnly ? "✓ Chỉ của tôi" : "Tất cả (kể cả chia sẻ)"}
            </button>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className="mr-1.5 size-3.5" />
              Làm mới
            </Button>
          </div>
        }
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
          description={
            mineOnly
              ? "Bạn chưa thu thập bài viết nào. Tắt bộ lọc để xem bài chia sẻ từ người khác."
              : "Chưa thu thập bài viết nào, hoặc không khớp từ khóa tìm kiếm."
          }
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36%]">Nội dung</TableHead>
                <TableHead>Tác giả</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead>Nguồn</TableHead>
                <TableHead className="w-[160px] text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const isOwn = user?.id != null && p.crawledBy === user.id;
                const commentsOpen = expandedComments.has(p.postId);

                return (
                  <>
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
                      {/* Ownership badge */}
                      <TableCell>
                        {isOwn ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            của tôi
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            chia sẻ
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Comments toggle */}
                          <button
                            onClick={() => toggleComments(p.postId)}
                            title={commentsOpen ? "Ẩn bình luận" : "Xem bình luận đã ghi nhận"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            {commentsOpen ? (
                              <ChevronUp className="size-3.5" />
                            ) : (
                              <MessageSquare className="size-3.5" />
                            )}
                          </button>
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
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expandable comments row */}
                    {commentsOpen && (
                      <TableRow key={`${p.postId}-comments`} className="bg-muted/30">
                        <TableCell colSpan={6} className="py-1 pl-6 pr-4">
                          <div className="flex items-start gap-2">
                            <ChevronDown className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Lịch sử bình luận đã ghi nhận (AI dùng để né nội dung trùng)
                              </p>
                              <CommentsPanel postId={p.postId} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
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

          {analyzeResult && (analyzeResult.usedProducts?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Sản phẩm tư vấn:
              </p>
              <ul className="space-y-0.5">
                {(analyzeResult.usedProducts ?? []).map((prod, i) => (
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
