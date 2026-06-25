"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import type { PromptProfile, PromptProfilesResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, CheckCircle2, Copy, Settings } from "lucide-react";

export default function ProfilesPage() {
  const { data, error, loading, reload } = useApi<PromptProfilesResponse>("/api/prompt-profiles");
  const [saving, setSaving] = useState<string | null>(null);

  const profiles = data?.profiles ?? [];

  const handleActivate = useCallback(
    async (id: string) => {
      setSaving(id);
      try {
        await apiFetch(`/api/prompt-profiles/${id}/activate`, { method: "POST" });
        reload();
      } catch {
        // silently handled
      } finally {
        setSaving(null);
      }
    },
    [reload],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm("Xóa hồ sơ này?")) return;
      setSaving(id);
      try {
        await apiFetch(`/api/prompt-profiles/${id}`, { method: "DELETE" });
        reload();
      } catch {
        // silently handled
      } finally {
        setSaving(null);
      }
    },
    [reload],
  );

  const handleClone = useCallback(
    async (p: PromptProfile) => {
      setSaving(p.id);
      try {
        await apiFetch("/api/prompt-profiles", {
          method: "POST",
          body: {
            name: `${p.name ?? p.id} (Bản sao)`,
            config: p.config ?? {},
          },
        });
        reload();
      } catch {
        // silently handled
      } finally {
        setSaving(null);
      }
    },
    [reload],
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PageHeader
        title="Hồ sơ ngành"
        description="Quản lý hồ sơ prompt quyết định giọng văn và đặc thù ngành của toàn bộ AI trong hệ thống. Hồ sơ đang kích hoạt là hồ sơ AI dùng."
      />

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded" />
          ))}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && profiles.length === 0 && (
        <EmptyState
          title="Chưa có hồ sơ ngành nào"
          description="Hồ sơ ngành quyết định giọng văn và đặc thù ngành của toàn bộ AI. Tạo hồ sơ đầu tiên để áp dụng cho ngành của bạn."
        />
      )}

      {!loading && !error && profiles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map((p) => {
            const cats = Array.isArray(p.config?.categories)
              ? (p.config!.categories as string[])
              : [];
            const description =
              typeof p.config?.description === "string"
                ? (p.config.description as string)
                : "";

            return (
              <Card key={p.id} className={p.isActive ? "ring-2 ring-primary" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {p.name ?? p.id}
                      {p.isActive && (
                        <Badge variant="default" className="text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-0.5" /> Đang dùng
                        </Badge>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
                  )}
                  {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {cats.map((c) => (
                        <Badge key={c} variant="secondary" className="text-[10px]">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    {!p.isActive && (
                      <Button
                        size="sm"
                        onClick={() => handleActivate(p.id)}
                        disabled={saving === p.id}
                      >
                        Kích hoạt
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClone(p)}
                      disabled={saving === p.id}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Nhân bản
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() => handleDelete(p.id)}
                      disabled={saving === p.id || p.isActive}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
