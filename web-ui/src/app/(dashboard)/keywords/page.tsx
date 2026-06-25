"use client";

import { useCallback, useState } from "react";
import { useApi } from "@/lib/use-api";
import { apiFetch } from "@/lib/api";
import type { Keyword, KeywordsResponse } from "@/lib/types";
import { PageHeader, EmptyState, ErrorState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Sparkles } from "lucide-react";

/* ---------- tab config ---------- */
const TAB_LIST = [
  {
    "key": "sell",
    "label": "Bán",
    "hint": "Từ khóa bán dùng ở phễu trích giá group VÀ để loại NGƯỜI BÁN khỏi Lọc thông minh."
  },
  {
    "key": "buy",
    "label": "Cần mua",
    "hint": "Từ khóa Cần mua giúp Lọc thông minh nhận diện KHÁCH CÓ NHU CẦU MUA."
  },
  {
    "key": "support",
    "label": "Hỗ trợ",
    "hint": "Từ khóa Hỗ trợ giúp Lọc thông minh nhận diện người HỎI KỸ THUẬT."
  }
] as const;

type TabKey = (typeof TAB_LIST)[number]["key"];

const ADDED_BY_LABEL: Record<string, string> = {
  ai: "AI",
  user: "Tôi",
  me: "Tôi",
  system: "Hệ thống",
};

/* ---------- page ---------- */
export default function KeywordsPage() {
  const [tab, setTab] = useState<TabKey>("sell");
  const [newWord, setNewWord] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, error, loading, reload } = useApi<KeywordsResponse>("/api/keywords");

  const keywords = (data?.keywords ?? []).filter(
    (k) => !tab || k.type === tab,
  );

  /* ---- actions ---- */
  const handleAdd = useCallback(async () => {
    const word = newWord.trim();
    if (!word) return;
    setSaving(true);
    try {
      await apiFetch("/api/keywords", {
        method: "POST",
        body: { keyword: word, kwType: tab, enabled: true },
      });
      setNewWord("");
      reload();
    } catch {
      /* silently handled */
    } finally {
      setSaving(false);
    }
  }, [newWord, tab, reload]);

  const handleToggle = useCallback(
    async (k: Keyword) => {
      try {
        await apiFetch(`/api/keywords/${k.id}`, {
          method: "PATCH",
          body: { enabled: !k.enabled },
        });
        reload();
      } catch {
        /* silently handled */
      }
    },
    [reload],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await apiFetch(`/api/keywords/${id}`, { method: "DELETE" });
        reload();
      } catch {
        /* silently handled */
      }
    },
    [reload],
  );

  const activeTab = TAB_LIST.find((t) => t.key === tab) ?? TAB_LIST[0];

  /* ---- render ---- */
  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <PageHeader
        title="Từ khóa học"
        description="Quản lý từ khóa nhận diện bán/mua/hỗ trợ. AI có thể tự học thêm khi trích xuất giá."
      />

      {/* Tabs */}
      <div className="flex items-center gap-2">
        {TAB_LIST.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{activeTab.hint}</p>

      {/* Add form */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Thêm từ khóa mới…"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          disabled={saving}
          className="max-w-xs"
        />
        <Button size="sm" onClick={handleAdd} disabled={saving || !newWord.trim()}>
          <Plus className="h-4 w-4 mr-1" /> Thêm
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      )}

      {/* Error */}
      {error && <ErrorState message={error} onRetry={reload} />}

      {/* Empty */}
      {!loading && !error && keywords.length === 0 && (
        <EmptyState
          title="Chưa có từ khóa"
          description={`Thêm từ khóa "${tab === "sell" ? "bán" : tab === "buy" ? "cần mua" : "hỗ trợ"}" thủ công, hoặc để AI tự học khi bạn trích xuất giá group.`}
        />
      )}

      {/* Keyword list */}
      {!loading && !error && keywords.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {keywords.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium text-sm truncate">{k.keyword}</span>
                    <Badge variant={k.enabled ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {k.enabled ? "Bật" : "Tắt"}
                    </Badge>
                    {String(k.addedBy ?? "") === "ai" && (
                      <Badge variant="outline" className="text-[10px] shrink-0 text-emerald-600 border-emerald-300">
                        <Sparkles className="h-3 w-3 mr-0.5" /> AI
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {ADDED_BY_LABEL[String(k.addedBy ?? "")] ?? String(k.addedBy ?? "Tôi")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(k)}
                    >
                      {k.enabled ? "Tắt" : "Bật"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(k.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
