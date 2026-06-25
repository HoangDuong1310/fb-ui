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
          toast.info("No changes to save");
          setSavingAi(false);
          return;
        }

        await apiFetch<AiConfig>("/api/me/ai-config", {
          method: "PUT",
          body,
        });
        setApiKey("");
        setClearKey(false);
        toast.success("AI configuration saved");
        reloadAi();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save AI config");
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
        toast.success("Share preferences saved");
        reloadShare();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save preferences");
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
        title="Settings"
        description="Manage your AI API keys and sharing preferences."
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
            Refresh
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
              AI Configuration
            </div>
            <p className="text-sm text-muted-foreground">
              Configure your personal AI provider. All AI content generation uses these settings.
            </p>

            <div className="space-y-2">
              <Label htmlFor="apiBase">
                <Globe className="mr-1 inline-block size-3.5" />
                API Base URL
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
                Model
              </Label>
              <Input
                id="model"
                placeholder={aiData?.modelDefault || "claude-opus-4.8"}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={aiData?.hasKey ? "•••••••• (key set)" : "sk-..."}
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
                Remove saved API key
              </Label>
            </div>

            {aiData && (
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                <p className="font-medium">Effective settings</p>
                <p>API Base: <code className="text-xs">{aiData.apiBaseEffective}</code></p>
                <p>Model: <code className="text-xs">{aiData.modelEffective}</code></p>
                <p>Key: {aiData.hasKey ? <span className="text-green-600 dark:text-green-400">Configured</span> : <span className="text-destructive">Not set</span>}</p>
              </div>
            )}

            <Button type="submit" disabled={savingAi}>
              <Save className="mr-1.5 size-3.5" />
              {savingAi ? "Saving..." : "Save AI Config"}
            </Button>
          </form>

          {/* ── Share Preferences ── */}
          <form onSubmit={handleSaveShare} className="space-y-4 rounded-[var(--radius-lg)] border border-border p-6">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Share2 className="size-5" />
              Share Preferences
            </div>
            <p className="text-sm text-muted-foreground">
              Choose which data types are shared by default with other users.
            </p>

            {[
              { label: "Crawled posts", checked: shareCrawled, onChange: setShareCrawled },
              { label: "Commented posts", checked: shareCommented, onChange: setShareCommented },
              { label: "Group prices", checked: shareGroupPrices, onChange: setShareGroupPrices },
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
              {savingShare ? "Saving..." : "Save Preferences"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}