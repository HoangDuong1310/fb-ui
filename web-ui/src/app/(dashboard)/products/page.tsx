"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/use-api";
import type { Product, ProductsResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Search, ExternalLink, Package } from "lucide-react";

function fmtPrice(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("vi-VN") + "đ";
}

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const { data, error, loading, reload } = useApi<ProductsResponse>(
    `/api/products${filter ? `?source=${encodeURIComponent(filter)}` : ""}`
  );
  const { data: searchData, loading: searching, error: searchErr } = useApi<{ products: Product[] }>(
    query.trim() ? `/api/products/search?q=${encodeURIComponent(query.trim())}` : ""
  );

  const products = query.trim()
    ? (searchData?.products ?? [])
    : (data?.products ?? []);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Sản phẩm / Giá" description="Quản lý sản phẩm được đồng bộ từ các nguồn." />

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="q">Tìm kiếm</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="q"
              placeholder="Tên sản phẩm..."
              className="pl-8"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="min-w-[150px]">
          <Label htmlFor="src">Nguồn</Label>
          <Input
            id="src"
            placeholder="Tất cả nguồn"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => reload()}>Làm mới</Button>
      </div>

      {(error || searchErr) && <ErrorState message={error || searchErr!} />}

      {loading || searching ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState title="Không có sản phẩm" description="Chưa có sản phẩm nào từ nguồn đồng bộ." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.productId}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-tight line-clamp-2">{p.name || p.productId}</h3>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-primary">{fmtPrice(p.price)}</span>
                  {p.source && <Badge variant="secondary" className="text-xs">{p.source}</Badge>}
                </div>
                {p.category && (
                  <p className="text-xs text-muted-foreground">{p.category}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !searching && products.length > 0 && (
        <p className="text-xs text-center text-muted-foreground">{products.length} sản phẩm</p>
      )}
    </div>
  );
}
