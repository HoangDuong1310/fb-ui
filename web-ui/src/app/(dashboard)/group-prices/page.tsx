"use client";

/**
 * Trang Giá theo nhóm — bảng giá sản phẩm trích xuất từ bài viết trong nhóm.
 *
 * Gọi GET /api/group-prices?category=&condition=&mineOnly= →
 * { groupPrices:[{ id, name, price, condition, category, sellerName,
 * groupId, postedAt, ... }] }.
 * Bộ lọc danh mục / tình trạng / "chỉ của tôi" đẩy thẳng vào query của API.
 */

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import { fmtPrice, fmtDateTime } from "@/lib/format";
import type { GroupPricesResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

const ALL = "__all__";

export default function GroupPricesPage() {
  const [category, setCategory] = useState(ALL);
  const [condition, setCondition] = useState(ALL);
  const [mineOnly, setMineOnly] = useState(false);
  const [q, setQ] = useState("");

  // Đẩy bộ lọc category/condition/mineOnly vào query của API; tìm theo tên
  // sản phẩm/người bán thì lọc phía client cho mượt.
  const path = useMemo(() => {
    const params = new URLSearchParams();
    if (category !== ALL) params.set("category", category);
    if (condition !== ALL) params.set("condition", condition);
    if (mineOnly) params.set("mineOnly", "1");
    const qs = params.toString();
    return qs ? `/api/group-prices?${qs}` : "/api/group-prices";
  }, [category, condition, mineOnly]);

  const { data, error, loading, reload } =
    useApi<GroupPricesResponse>(path);

  // Danh mục/tình trạng cho dropdown lấy từ chính dữ liệu trả về.
  const { categories, conditions, filtered } = useMemo(() => {
    const rows = data?.groupPrices ?? [];
    const cats = new Set<string>();
    const conds = new Set<string>();
    for (const r of rows) {
      if (r.category) cats.add(r.category);
      if (r.condition) conds.add(r.condition);
    }
    const term = q.trim().toLowerCase();
    const list = term
      ? rows.filter(
          (r) =>
            (r.name ?? "").toLowerCase().includes(term) ||
            (r.sellerName ?? "").toLowerCase().includes(term),
        )
      : rows;
    return {
      categories: Array.from(cats).sort(),
      conditions: Array.from(conds).sort(),
      filtered: list,
    };
  }, [data, q]);

  return (
    <div>
      <PageHeader
        title="Giá theo nhóm"
        description="Bảng giá sản phẩm được trích xuất từ bài rao trong các nhóm."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Tìm theo tên sản phẩm, người bán…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Danh mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả danh mục</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tình trạng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Mọi tình trạng</SelectItem>
            {conditions.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={mineOnly ? "mine" : "all"}
          onValueChange={(v) => setMineOnly(v === "mine")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả nguồn</SelectItem>
            <SelectItem value="mine">Chỉ của tôi</SelectItem>
          </SelectContent>
        </Select>
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
          title="Chưa có dữ liệu giá"
          description="Chưa trích xuất được giá nào, hoặc không khớp bộ lọc hiện tại."
        />
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[32%]">Sản phẩm</TableHead>
                <TableHead className="text-right">Giá</TableHead>
                <TableHead>Tình trạng</TableHead>
                <TableHead>Danh mục</TableHead>
                <TableHead>Người bán</TableHead>
                <TableHead>Thời gian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.name || "(không tên)"}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {fmtPrice(r.price)}
                  </TableCell>
                  <TableCell>
                    {r.condition ? (
                      <Badge variant="secondary">{r.condition}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.category || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.sellerProfile ? (
                      <a
                        href={r.sellerProfile}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {r.sellerName || "—"}
                      </a>
                    ) : (
                      r.sellerName || "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fmtDateTime(r.postedAt ?? r.parsedAt)}
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
