"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/use-api";
import type { Product, ProductsResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Store, ExternalLink, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

function fmtPrice(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("vi-VN") + "đ";
}

export default function MyStorePage() {
  const { data, error, loading, reload } = useApi<ProductsResponse>(
    "/api/products?source=mystore"
  );
  const [deleting, setDeleting] = useState<string | null>(null);

  const products = data?.products ?? [];

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      await apiFetch(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Đã xóa sản phẩm");
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Xóa thất bại");
    } finally {
      setDeleting(null);
    }
  }, [reload]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Cửa hàng của tôi"
        description="Sản phẩm bạn đã tự thêm vào kho (source=mystore)."
        actions={<Button variant="outline" onClick={() => reload()}>Làm mới</Button>}
      />

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="Kho trống"
          description="Chưa có sản phẩm nào. Hãy thêm sản phẩm từ extension hoặc trang Sản phẩm."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.productId}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-tight line-clamp-2">{p.name || p.productId}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deleting === p.productId}
                      onClick={() => handleDelete(p.productId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-primary">{fmtPrice(p.price)}</span>
                  {p.category && <Badge variant="outline" className="text-xs">{p.category}</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && products.length > 0 && (
        <p className="text-xs text-center text-muted-foreground">{products.length} sản phẩm trong kho</p>
      )}
    </div>
  );
}
