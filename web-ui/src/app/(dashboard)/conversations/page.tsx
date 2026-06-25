"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Conversation, AiDraftResult } from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MessageCircle,
  Send,
  CheckCircle,
  XCircle,
  Bot,
} from "lucide-react";

type Tab = "watching" | "replied" | "drafted" | "closed" | "all";

const STATUS_LABEL: Record<string, string> = {
  watching: "Watching",
  replied: "Has reply",
  drafted: "Drafted",
  closed: "Closed",
};

export default function ConversationsPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [draftingId, setDraftingId] = useState<number | null>(null);
  const [tone, setTone] = useState("friendly");
  const [language, setLanguage] = useState("vi");
  const [draftResults, setDraftResults] = useState<Record<number, AiDraftResult>>({});

  const {
    data: convResp,
    loading,
    error,
    reload,
  } = useApi<{ conversations: Conversation[] }>(
    `/api/conversations?status=${tab === "all" ? "" : tab}`,
  );

  const conversations: Conversation[] = convResp?.conversations ?? [];

  const draftReply = useCallback(
    async (conv: Conversation) => {
      setDraftingId(conv.id);
      try {
        const lastReply = conv.replies?.[conv.replies.length - 1];
        const res = await apiFetch<AiDraftResult>("/api/ai/draft-conversation-reply", {
          method: "POST",
          body: {
            conv: {
              id: conv.id,
              postText: conv.postText,
              myComment: conv.myComment,
              replies: conv.replies,
            },
            opts: { tone, language },
          },
        });
        setDraftResults((prev) => ({ ...prev, [conv.id]: res }));
        toast.success("Reply drafted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Draft failed");
      } finally {
        setDraftingId(null);
      }
    },
    [tone, language],
  );

  const copyDraft = useCallback((convId: number) => {
    const draft = draftResults[convId];
    if (!draft?.content) return;
    navigator.clipboard.writeText(draft.content).then(
      () => toast.success("Copied draft"),
      () => toast.error("Copy failed"),
    );
  }, [draftResults]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversations"
        description="Track comment replies and draft AI-powered responses for customer conversations."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <div className="flex gap-1">
          {(["watching", "replied", "drafted", "closed", "all"] as Tab[]).map((t) => (
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
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">Vietnamese</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && (
        <p className="text-sm text-muted-foreground">Loading conversations…</p>
      )}

      {!loading && conversations.length === 0 && (
        <EmptyState
          title="No conversations"
          description="No tracked conversations yet. Conversations appear when someone replies to your comments."
        />
      )}

      {conversations.map((conv) => {
        const draft = draftResults[conv.id];
        return (
          <div key={conv.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5" />
                <Badge variant="outline">
                  {conv.status ? (STATUS_LABEL[conv.status] ?? conv.status) : "—"}
                </Badge>
                {conv.groupName && <span>{conv.groupName}</span>}
              </div>
              <span>{conv.createdAt ? new Date(conv.createdAt).toLocaleDateString() : ""}</span>
            </div>

            {conv.postText && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Post: </span>
                {conv.postText.slice(0, 120)}…
              </p>
            )}

            {conv.myComment && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">My comment: </span>
                {conv.myComment.slice(0, 120)}
              </p>
            )}

            {conv.replies.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium">Replies ({conv.replies.length})</span>
                {conv.replies.slice(-3).map((r, i) => (
                  <p key={i} className="pl-3 text-xs text-muted-foreground border-l-2">
                    <span className="font-medium">{r.author ?? "Unknown"}</span>:{" "}
                    {(r.text ?? "").slice(0, 150)}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => draftReply(conv)}
                disabled={draftingId === conv.id}
              >
                <Bot className="mr-1 h-3.5 w-3.5" />
                {draftingId === conv.id ? "Drafting…" : "Draft Reply"}
              </Button>
              {draft && (
                <Button size="sm" variant="ghost" onClick={() => copyDraft(conv.id)}>
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                  Copy Draft
                </Button>
              )}
            </div>

            {draft && (
              <div className="rounded bg-muted p-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.content}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
