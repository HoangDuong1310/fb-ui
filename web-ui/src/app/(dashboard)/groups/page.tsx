"use client";

/**
 * Trang Nhóm — danh sách nhóm Facebook đã thu thập + số bài mỗi nhóm.
 *
 * Gọi GET /api/groups → { groups:[{ groupId, groupName, postCount, ... }] }.
 * Có ô tìm kiếm lọc theo tên/ID nhóm (lọc phía client).
 * Nút "Crawl" mỗi hàng gửi lệnh crawl_group tới extension qua remote-commands.
 */

import { useMemo, useState, useCallback } from "react";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import { fmtNumber, fmtDateTime } from "@/lib/format";
import type { GroupsResponse } from "@/lib/types";
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

interface CrawlNotice {
  groupId: string;
  ok: boolean;
  text: string;
}

export default function GroupsPage() {
  const { data, error, loading, reload } =
    useApi<GroupsResponse>("/api/groups");
  const [q, setQ] = useState("");
  const [crawlingId, setCrawlingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<CrawlNotice | null>(null);

  // --- quét danh sách nhóm đã tham gia ---
  const [scanningGroups, setScanningGroups] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // --- crawl theo ID nhập tay ---
  const [crawlInput, setCrawlInput] = useState("");
  const [crawlingCustom, setCrawlingCustom] = useState(false);
  const [customNotice, setCustomNotice] = useState<CrawlNotice | null>(null);

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

  const handleCrawl = useCallback(async (groupId: string) => {
    setCrawlingId(groupId);
    setNotice(null);
    try {
      await apiFetch("/api/remote-commands", {
        method: "POST",
        body: { type: "crawl_group", payload: { groupId } },
      });
      setNotice({ groupId, ok: true, text: "Đã gửi lệnh crawl. Extension sẽ thực hiện trong vài chục giây." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setNotice({ groupId, ok: false, text: `Lỗi: ${msg}` });
    } finally {
      setCrawlingId(null);
    }
  }, []);

  const handleScanGroups = useCallback(async () => {
    setScanningGroups(true);
    setScanNotice(null);
    try {
      await apiFetch("/api/remote-commands", {
        method: "POST",
        body: { type: "scan_groups", payload: {} },
      });
      setScanNotice({
        ok: true,
        text: "Đã gửi lệnh quét nhóm. Extension sẽ mở trang \"Nhóm của bạn\" và quét danh sách \u2014 quá trình có thể mất vài phút.",
      });
      // Tự reload danh sách sau 10s để hiển thị nhóm mới
      setTimeout(() => reload(), 10_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setScanNotice({ ok: false, text: `Lỗi: ${msg}` });
    } finally {
      setScanningGroups(false);
    }
  }, [reload]);

  const handleCrawlCustom = useCallback(async () => {
    const groupId = crawlInput.trim();
    if (!groupId) return;
    setCrawlingCustom(true);
    setCustomNotice(null);
    try {
      await apiFetch("/api/remote-commands", {
        method: "POST",
        body: { type: "crawl_group", payload: { groupId } },
      });
      setCustomNotice({
        groupId,
        ok: true,
        text: `Đã gửi lệnh crawl nhóm ${groupId}. Extension sẽ thực hiện trong vài chục giây.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định";
      setCustomNotice({ groupId, ok: false, text: `Lỗi: ${msg}` });
    } finally {
      setCrawlingCustom(false);
    }
  }, [crawlInput]);

  return (
    <div>
      <PageHeader
        title="Nhóm"
        description="Các nhóm Facebook đã thu thập dữ liệu."
      />

      {/* ── Quét danh sách nhóm đã tham gia ── luôn hiển thị ── */}
      <div className="mb-4 rounded-[var(--radius-lg)] border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">Quét nhóm đã tham gia</p>
        <p className="text-xs text-muted-foreground">
          Extension sẽ mở trang "Nhóm của bạn" trên Facebook và tự động thu
          thập danh sách tất cả nhóm bạn đã tham gia, rồi lưu vào hệ thống.
        </p>
        <Button
          disabled={scanningGroups}
          onClick={handleScanGroups}
        >
          {scanningGroups ? "Đang gửi…" : "Quét nhóm đã tham gia"}
        </Button>
        {scanNotice && (
          <div
            className={`rounded border px-3 py-2 text-sm ${
              scanNotice.ok
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {scanNotice.text}
          </div>
        )}
      </div>

      {/* ── Crawl theo ID nhập tay ── luôn hiển thị ── */}
      <div className="mb-6 rounded-[var(--radius-lg)] border border-border p-4 space-y-3">
        <p className="text-sm font-semibold">Crawl nhóm theo ID</p>
        <p className="text-xs text-muted-foreground">
          Nhập ID nhóm Facebook (số hoặc slug) rồi bấm Crawl — extension sẽ
          mở nhóm và thu thập bài viết.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Ví dụ: 123456789 hoặc ten-nhom"
            value={crawlInput}
            onChange={(e) => setCrawlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCrawlCustom()}
            className="max-w-xs"
          />
          <Button
            disabled={crawlingCustom || !crawlInput.trim()}
            onClick={handleCrawlCustom}
          >
            {crawlingCustom ? "Đang gửi…" : "Crawl"}
          </Button>
        </div>
        {customNotice && (
          <div
            className={`rounded border px-3 py-2 text-sm ${
              customNotice.ok
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {customNotice.text}
          </div>
        )}
      </div>

      {/* ── Tìm kiếm & bảng nhóm đã thu thập ── */}
      <div className="mb-4 max-w-xs">
        <Input
          placeholder="Tìm theo tên hoặc ID nhóm…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {notice && (
        <div
          className={`mb-4 rounded-[var(--radius-lg)] border px-4 py-3 text-sm ${
            notice.ok
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {notice.text}
        </div>
      )}

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
                <TableHead className="text-right">Thao tác</TableHead>
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
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={crawlingId === g.groupId}
                      onClick={() => handleCrawl(g.groupId)}
                    >
                      {crawlingId === g.groupId ? "Đang gửi…" : "Crawl"}
                    </Button>
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
