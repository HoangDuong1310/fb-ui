"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import type { AiConfig, SharePrefs } from "@/lib/types";
import { PageHeader } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save, RefreshCw, KeyRound, Globe, Cpu, Share2 } from "lucide-react";

export default function SettingsPage() {
  /* ── AI config ── */
  const {
    data: aiData,
    error: aiError,
    loading: aiLoading,
    reload: reloadAi,
  } = useApi<AiConfig>("/api/me/ai-config");

  const [apiBase, setApiBase] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  /* ── Share prefs ── */
  const {
    data: shareData,
    error: shareError,
    loading: shareLoading,
    reload: reloadShare,
  } = useApi<SharePrefs>("/api/me/share-prefs");

  const [shareCrawled, setShareCrawled] = useState(false);
  const [shareCommented, setShareCommented] = useState(false);
  const [shareGroupPrices, setShareGroupPrices] = useState(false);
  const [savingShare, setSavingShare] = useState(false);

  /* ── Sync form when data loads ── */
  useEffect(() => {
    if (aiData) {
      setApiBase(aiData.apiBase ?? "");
      setModel(aiData.model ?? "");
    }
  }, [aiData]);

  useEffect(() => {
    if (shareData) {
      setShareCrawled(shareData.shareCrawledDefault);
      setShareCommented(shareData.shareCommentedDefault);
      setShareGroupPrices(shareData.shareGroupPricesDefault);
    }
  }, [shareData]);

  /* ── Save AI config ── */
  const handleSaveAi = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingAi(true);
      try {
        const body: Record<string, unknown> = {};
        if (apiBase !== (aiData?.apiBase ?? "")) body.apiBase = apiBase || null;
        if (model !== (aiData?.model ?? "")) body.model = model || null;
        if (apiKey) body.apiKey = apiKey;
        if (clearKey) body.clearKey = true;

        if (Object.keys(body).length === 0) {
          toast.info("Không có thay đổi nào để lưu");
          setSavingAi(false);
          return;
        }

        await apiFetch<AiConfig>("/api/me/ai-config", {
          method: "PUT",
          body,
        });
        setApiKey("");
        setClearKey(false);
        toast.success("Đã lưu cấu hình AI");
        reloadAi();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lưu cấu hình AI thất bại");
      } finally {
        setSavingAi(false);
      }
    },
    [apiBase, model, apiKey, clearKey, aiData, reloadAi],
  );

  /* ── Save share prefs ── */
  const handleSaveShare = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSavingShare(true);
      try {
        await apiFetch<SharePrefs>("/api/me/share-prefs", {
          method: "PATCH",
          body: {
            share_crawled_default: shareCrawled,
            share_commented_default: shareCommented,
            share_group_prices_default: shareGroupPrices,
          },
        });
        toast.success("Đã lưu tùy chọn chia sẻ");
        reloadShare();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Lưu tùy chọn chia sẻ thất bại");
      } finally {
        setSavingShare(false);
      }
    },
    [shareCrawled, shareCommented, shareGroupPrices, reloadShare],
  );

  const loading = aiLoading || shareLoading;
  const error = aiError || shareError;

  return (
    <div>
      <PageHeader
        title="Cài đặt"
        description="Quản lý khóa API AI và tùy chọn chia sẻ của bạn."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reloadAi();
              reloadShare();
            }}
            disabled={loading}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Làm mới
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full rounded-[var(--radius-lg)]" />
          <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-lg)] border border-destructive/50 bg-destructive/10 p-6 text-destructive">
          {error}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── AI Configuration ── */}
          <form onSubmit={handleSaveAi} className="space-y-4 rounded-[var(--radius-lg)] border border-border p-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Cpu className="size-5" />
              Cấu hình AI
            </div>
            <p className="text-sm text-muted-foreground">
              Cấu hình nhà cung cấp AI cá nhân. Tất cả nội dung tạo bằng AI đều dùng các cài đặt này.
            </p>

            <div className="space-y-2">
              <Label htmlFor="apiBase">
                <Globe className="mr-1 inline-block size-3.5" />
                URL gốc API
              </Label>
              <Input
                id="apiBase"
                placeholder={aiData?.apiBaseDefault || "https://api.example.com/v1"}
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">
                <KeyRound className="mr-1 inline-block size-3.5" />
                Mô hình
              </Label>
              <Input
                id="model"
                placeholder={aiData?.modelDefault || "claude-opus-4.8"}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">Khóa API</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={aiData?.hasKey ? "•••••••• (đã đặt khóa)" : "sk-..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="clearKey"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="clearKey" className="text-sm text-muted-foreground">
                Xóa khóa API đã lưu
              </Label>
            </div>

            {aiData && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p className="font-medium">Cài đặt đang dùng</p>
                <p>URL gốc API: <code className="text-xs">{aiData.apiBaseEffective}</code></p>
                <p>Mô hình: <code className="text-xs">{aiData.modelEffective}</code></p>
                <p>Khóa: {aiData.hasKey ? <span className="text-green-600 dark:text-green-400">Đã cấu hình</span> : <span className="text-destructive">Chưa đặt</span>}</p>
              </div>
            )}

            <Button type="submit" disabled={savingAi}>
              <Save className="mr-1.5 size-3.5" />
              {savingAi ? "Đang lưu..." : "Lưu cấu hình AI"}
            </Button>
          </form>

          {/* ── Share Preferences ── */}
          <form onSubmit={handleSaveShare} className="space-y-4 rounded-[var(--radius-lg)] border border-border p-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Share2 className="size-5" />
              Tùy chọn chia sẻ
            </div>
            <p className="text-sm text-muted-foreground">
              Chọn loại dữ liệu được chia sẻ mặc định với người dùng khác.
            </p>

            {[
              { label: "Bài viết đã thu thập", checked: shareCrawled, onChange: setShareCrawled },
              { label: "Bài viết đã bình luận", checked: shareCommented, onChange: setShareCommented },
              { label: "Giá nhóm", checked: shareGroupPrices, onChange: setShareGroupPrices },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.onChange(e.target.checked)}
                  className="size-4"
                />
                <Label className="text-sm text-muted-foreground">{item.label}</Label>
              </div>
            ))}

            <Button type="submit" disabled={savingShare}>
              <Save className="mr-1.5 size-3.5" />
              {savingShare ? "Đang lưu..." : "Lưu tùy chọn"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}