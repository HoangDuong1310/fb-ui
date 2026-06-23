"use client";

/**
 * Trang chi tiết một người dùng (chỉ admin).
 *
 * GET /api/admin/users/:id/overview → tổng hợp TOÀN BỘ dữ liệu extension mà
 * user sở hữu: bài đã crawl (posts), nhóm (groups), bình luận (comments), hội
 * thoại (conversations), tư vấn (advisories), giá nhóm (group_prices) cùng tùy
 * chọn chia sẻ. Mỗi loại hiển thị tổng số + tối đa 50 dòng mới nhất.
 *
 * LƯU Ý: "Từ khóa học" (learned_keywords) DÙNG CHUNG toàn hệ thống, không quy
 * về một tài khoản nên không hiển thị ở đây — quản lý tại tab Dữ liệu.
 */

import { use, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { fmtDateTime, fmtPrice, truncate } from "@/lib/format";
import type { AdminUserOverview } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_META: Record<
  AdminUserOverview["user"]["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Chờ duyệt", variant: "secondary" },
  approved: { label: "Đã duyệt", variant: "default" },
  locked: { label: "Đã khóa", variant: "destructive" },
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, reload } = useApi<AdminUserOverview>(
    id ? `/api/admin/users/${id}/overview` : null,
  );

  if (error) {
    return (
      <div>
        <BackLink />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        <BackLink />
        <Skeleton className="mb-6 h-16 w-full" />
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { user, counts, sharePrefs } = data;
  const st = STATUS_META[user.status];

  return (
    <div>
      <BackLink />

      <PageHeader
        title={user.displayName || user.email}
        description={`${user.email} · tham gia ${fmtDateTime(user.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={user.role === "admin" ? "default" : "outline"}>
              {user.role === "admin" ? "Admin" : "Người dùng"}
            </Badge>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Bài đã crawl" value={counts.posts} />
        <StatCard label="Nhóm" value={counts.groups} />
        <StatCard label="Bình luận" value={counts.comments} />
        <StatCard label="Hội thoại" value={counts.conversations} />
        <StatCard label="Tư vấn" value={counts.advisories} />
        <StatCard label="Giá nhóm" value={counts.groupPrices} />
      </div>

      {sharePrefs ? (
        <div className="mb-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Tùy chọn chia sẻ:</span>
          <Badge variant={sharePrefs.shareCrawled ? "default" : "outline"}>
            Bài crawl: {sharePrefs.shareCrawled ? "Bật" : "Tắt"}
          </Badge>
          <Badge variant={sharePrefs.shareCommented ? "default" : "outline"}>
            Bình luận: {sharePrefs.shareCommented ? "Bật" : "Tắt"}
          </Badge>
          <Badge variant={sharePrefs.shareGroupPrices ? "default" : "outline"}>
            Giá nhóm: {sharePrefs.shareGroupPrices ? "Bật" : "Tắt"}
          </Badge>
        </div>
      ) : null}

      <Tabs defaultValue="posts">
        <TabsList className="flex-wrap">
          <TabsTrigger value="posts">Bài ({counts.posts})</TabsTrigger>
          <TabsTrigger value="groups">Nhóm ({counts.groups})</TabsTrigger>
          <TabsTrigger value="comments">
            Bình luận ({counts.comments})
          </TabsTrigger>
          <TabsTrigger value="conversations">
            Hội thoại ({counts.conversations})
          </TabsTrigger>
          <TabsTrigger value="advisories">
            Tư vấn ({counts.advisories})
          </TabsTrigger>
          <TabsTrigger value="groupPrices">
            Giá nhóm ({counts.groupPrices})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          {data.posts.length === 0 ? (
            <EmptyState title="Chưa có bài viết" />
          ) : (
            <DataTable
              headers={["Nội dung", "Nhóm", "Tác giả", "Crawl lúc"]}
              rows={data.posts.map((p) => [
                <span key="t" className="block max-w-md">
                  {p.permalink ? (
                    <a
                      href={p.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {truncate(p.text, 100) || "(không có nội dung)"}
                    </a>
                  ) : (
                    truncate(p.text, 100) || "(không có nội dung)"
                  )}
                </span>,
                p.groupName || p.groupId,
                p.authorName || "—",
                fmtDateTime(p.crawledAt),
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="groups">
          {data.groups.length === 0 ? (
            <EmptyState title="Chưa có nhóm" />
          ) : (
            <DataTable
              headers={["Tên nhóm", "ID nhóm", "Cập nhật"]}
              rows={data.groups.map((g) => [
                g.groupName || "—",
                g.groupId,
                fmtDateTime(g.updatedAt),
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="comments">
          {data.comments.length === 0 ? (
            <EmptyState title="Chưa có bình luận" />
          ) : (
            <DataTable
              headers={["Nội dung", "Bài (post_id)", "Lúc"]}
              rows={data.comments.map((c) => [
                <span key="c" className="block max-w-md">
                  {truncate(c.content, 100) || "—"}
                </span>,
                c.postId,
                fmtDateTime(c.commentedAt),
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="conversations">
          {data.conversations.length === 0 ? (
            <EmptyState title="Chưa có hội thoại" />
          ) : (
            <DataTable
              headers={["Comment của tôi", "Nhóm", "Trạng thái", "Cập nhật"]}
              rows={data.conversations.map((c) => [
                <span key="c" className="block max-w-md">
                  {truncate(c.myComment, 100) || "—"}
                </span>,
                c.groupName || "—",
                <Badge key="s" variant="outline">
                  {c.status || "—"}
                </Badge>,
                fmtDateTime(c.updatedAt),
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="advisories">
          {data.advisories.length === 0 ? (
            <EmptyState title="Chưa có tư vấn" />
          ) : (
            <DataTable
              headers={["Nội dung", "Bài (post_id)", "Trạng thái", "Cập nhật"]}
              rows={data.advisories.map((a) => [
                <span key="c" className="block max-w-md">
                  {truncate(a.content, 100) || "—"}
                </span>,
                a.postId || "—",
                <Badge key="s" variant="outline">
                  {a.status || "—"}
                </Badge>,
                fmtDateTime(a.updatedAt),
              ])}
            />
          )}
        </TabsContent>

        <TabsContent value="groupPrices">
          {data.groupPrices.length === 0 ? (
            <EmptyState title="Chưa có giá nhóm" />
          ) : (
            <DataTable
              headers={["Tên", "Giá", "Tình trạng", "Người bán"]}
              rows={data.groupPrices.map((g) => [
                g.name || "—",
                fmtPrice(g.price),
                g.condition || "—",
                g.sellerName || "—",
              ])}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
      <Link href="/admin/users">
        <ArrowLeft className="size-4" />
        Danh sách người dùng
      </Link>
    </Button>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((cells, i) => (
            <TableRow key={i}>
              {cells.map((cell, j) => (
                <TableCell key={j}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
