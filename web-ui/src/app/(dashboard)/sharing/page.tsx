"use client";

import { useCallback, useState, useEffect } from "react";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import type { SharePrefs } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, Eye, MessageSquare, DollarSign } from "lucide-react";

const TOGGLES = [
  {
    key: "shareCrawledDefault" as const,
    setKey: "share_crawled_default",
    label: "Chia sẻ bài đã crawl",
    description: "Bài viết bạn đã crawl sẽ hiển thị cho người dùng khác.",
    icon: Globe,
  },
  {
    key: "shareCommentedDefault" as const,
    setKey: "share_commented_default",
    label: "Chia sẻ bình luận",
    description: "Bài viết và bình luận của bạn sẽ hiển thị cho người dùng khác.",
    icon: MessageSquare,
  },
  {
    key: "shareGroupPricesDefault" as const,
    setKey: "share_group_prices_default",
    label: "Chia sẻ giá group",
    description: "Dòng giá trích từ group sẽ hiển thị cho người dùng khác.",
    icon: DollarSign,
  },
] as const;

export default function SharingPage() {
  const { data, error, loading, reload } = useApi<SharePrefs>("/api/me/share-prefs");

  const [prefs, setPrefs] = useState({
    shareCrawledDefault: false,
    shareCommentedDefault: false,
    shareGroupPricesDefault: false,
  });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setPrefs({
        shareCrawledDefault: !!data.shareCrawledDefault,
        shareCommentedDefault: !!data.shareCommentedDefault,
        shareGroupPricesDefault: !!data.shareGroupPricesDefault,
      });
    }
  }, [data]);

  const handleToggle = useCallback(
    async (setKey: string, key: keyof typeof prefs) => {
      const newValue = !prefs[key];
      setSaving(setKey);
      try {
        const res = await apiFetch<{ ok?: boolean } & SharePrefs>("/api/me/share-prefs", {
          method: "PATCH",
          body: { [setKey]: newValue ? 1 : 0 },
        });
        // Sync with server response
        if (res) {
          setPrefs({
            shareCrawledDefault: !!res.shareCrawledDefault,
            shareCommentedDefault: !!res.shareCommentedDefault,
            shareGroupPricesDefault: !!res.shareGroupPricesDefault,
          });
        }
      } catch {
        // Revert on error
        setPrefs((p) => ({ ...p, [key]: !newValue }));
      } finally {
        setSaving(null);
      }
    },
    [prefs],
  );

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Cài đặt chia sẻ"
        description="Điều khiển việc dữ liệu của bạn có được chia sẻ chung (cho người dùng khác xem) hay giữ riêng tư. Mỗi công tắc khi đổi sẽ CASCADE xuống mọi bản ghi hiện có."
      />

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded" />
          ))}
        </div>
      )}

      {error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && (
        <div className="space-y-4">
          {TOGGLES.map((t) => {
            const Icon = t.icon;
            const value = prefs[t.key];
            const isSaving = saving === t.setKey;

            return (
              <Card key={t.setKey}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(t.setKey, t.key)}
                    disabled={isSaving}
                    className={`
                      relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                      transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      disabled:cursor-not-allowed disabled:opacity-50
                      ${value ? "bg-primary" : "bg-input"}
                    `}
                    role="switch"
                    aria-checked={value}
                  >
                    <span
                      className={`
                        pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-lg ring-0
                        transition-transform duration-200 ease-in-out
                        ${value ? "translate-x-5" : "translate-x-0"}
                      `}
                    />
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
