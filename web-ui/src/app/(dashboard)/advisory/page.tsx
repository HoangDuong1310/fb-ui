"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Advisory, AiAnalyzeResult } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  Send,
  XCircle,
  FileText,
  Shield,
  ShieldAlert,
  Clock,
} from "lucide-react";

type Tab = "pending" | "sent" | "rejected" | "all";

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  sent: <Send className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  sent: "default",
  rejected: "destructive",
};

export default function AdvisoryPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [analyzeText, setAnalyzeText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AiAnalyzeResult | null>(null);

  const {
    data: advisoryResp,
    loading,
    error,
    reload,
  } = useApi<{ advisories: Advisory[] }>(
    `/api/advisories?status=${tab === "all" ? "" : tab}`,
  );

  const advisories: Advisory[] = advisoryResp?.advisories ?? [];

  const handleAnalyze = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!analyzeText.trim()) {
        toast.error("Paste the post text to analyze.");
        return;
      }
      setAnalyzing(true);
      setAnalyzeResult(null);
      try {
        const res = await apiFetch<AiAnalyzeResult>("/api/ai/analyze", {
          method: "POST",
          body: { post: { text: analyzeText.trim() } },
        });
        setAnalyzeResult(res);
        toast.success("Analysis complete");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Analysis failed");
      } finally {
        setAnalyzing(false);
      }
    },
    [analyzeText],
  );

  const approveAdvisory = useCallback(
    async (id: number) => {
      try {
        await apiFetch(`/api/advisories/${id}/send`, { method: "POST" });
        toast.success("Advisory approved and queued");
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed");
      }
    },
    [reload],
  );

  const rejectAdvisory = useCallback(
    async (id: number) => {
      try {
        await apiFetch(`/api/advisories/${id}/reject`, { method: "POST" });
        toast.success("Advisory rejected");
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    },
    [reload],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Advisory"
        description="AI-powered sales advisory — analyze posts, draft replies, and manage before sending."
      />

      {/* Analyze form */}
      <form onSubmit={handleAnalyze} className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="adv-text">Paste a post to analyze</Label>
          <Textarea
            id="adv-text"
            rows={4}
            placeholder="Paste the post text here for full analysis (classify + products + advisory)…"
            value={analyzeText}
            onChange={(e) => setAnalyzeText(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={analyzing || !analyzeText.trim()}>
          <Search className="mr-2 h-4 w-4" />
          {analyzing ? "Analyzing…" : "Analyze Post"}
        </Button>
      </form>

      {/* Analysis result */}
      {analyzeResult && (
        <div className="space-y-3 rounded-lg border border-dashed p-6">
          <h3 className="text-sm font-medium">Analysis Result</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            {analyzeResult.products.length > 0 && (
              <Badge variant="outline">{analyzeResult.products.length} product(s) matched</Badge>
            )}
            {analyzeResult.advisory.needsHumanCheck && (
              <Badge variant="destructive">Needs Review</Badge>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {analyzeResult.advisory.content}
          </p>
          {analyzeResult.products.length > 0 && (
            <div className="text-xs">
              <span className="font-medium">Matched products: </span>
              {analyzeResult.products.map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Tabs + list */}
      <div className="flex gap-1 border-b pb-px">
        {(["pending", "sent", "rejected", "all"] as Tab[]).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!loading && advisories.length === 0 && (
        <EmptyState title="No advisories" description="No advisory drafts in this category yet." />
      )}

      {advisories.map((a) => (
        <div key={a.id} className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {a.status ? (STATUS_ICON[a.status] ?? <FileText className="h-3.5 w-3.5" />) : <FileText className="h-3.5 w-3.5" />}
              <Badge variant={a.status ? (STATUS_VARIANT[a.status] ?? "outline") : "outline"}>{a.status ?? "draft"}</Badge>
              <span>{a.postId?.slice(0, 60)}…</span>
            </div>
            <span>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.content}</p>
          {a.needsHumanCheck && (
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>{a.checkNote ?? "Needs human review"}</span>
            </div>
          )}
          {a.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => approveAdvisory(a.id)}>
                <Shield className="mr-1 h-3.5 w-3.5" />
                Approve &amp; Send
              </Button>
              <Button size="sm" variant="destructive" onClick={() => rejectAdvisory(a.id)}>
                <XCircle className="mr-1 h-3.5 w-3.5" />
                Reject
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
