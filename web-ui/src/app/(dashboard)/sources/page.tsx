"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/use-api";
import type { Source, SourcesResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Globe, Trash2, Plus } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function SourcesPage() {
  const { data, error, loading, reload } = useApi<SourcesResponse>("/api/sources");
  const [newId, setNewId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const sources = data?.sources ?? [];

  const handleAdd = useCallback(async () => {
    if (!newId.trim()) return toast.error("Nhap ID nguon");
    setSaving(true);
    try {
      await apiFetch("/api/sources", {
        method: "POST",
        body: { id: newId.trim(), config: { url: newUrl.trim() || undefined } },
      });
      toast.success("Da them nguon");
      setNewId("");
      setNewUrl("");
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Them that bai");
    } finally {
      setSaving(false);
    }
  }, [newId, newUrl, reload]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/sources/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Da xoa nguon");
      reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Xoa that bai");
    }
  }, [reload]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Nguon du lieu"
        description="Quan ly cac nguon dong bo san pham."
      />

      <div className="flex gap-3 items-end flex-wrap">
        <div className="min-w-[140px]">
          <Label htmlFor="sid">ID nguon</Label>
          <Input id="sid" placeholder="vidu: cellphones" value={newId} onChange={(e) => setNewId(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="surl">URL (tuy chon)</Label>
          <Input id="surl" placeholder="https://..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} />
        </div>
        <Button onClick={handleAdd} disabled={saving || !newId.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Them
        </Button>
      </div>

      {error && <ErrorState message={error} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : sources.length === 0 ? (
        <EmptyState title="Chua co nguon" description="Them nguon de bat dau dong bo san pham." />
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{s.id}</p>
                    {typeof s.config?.url === "string" && s.config.url && (
                      <p className="text-xs text-muted-foreground truncate">{s.config.url}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDelete(s.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
