"use client";

import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type {
  Advisory,
  AiAnalyzeResult,
  GenerateAdvisoriesResult,
  GroupsResponse,
} from "@/lib/types";
import { PageHeader, EmptyState } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Send,
  XCircle,
  FileText,
  Shield,
  ShieldAlert,
  Clock,
  Sparkles,
  Pencil,
  Trash2,
  ExternalLink,
  Package,
} from "lucide-react";

type Tab = "pending" | "sent" | "rejected" | "all";

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  sent: <Send className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
};

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  sent: "default",
  rejected: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  sent: "Đã gửi",
  rejected: "Đã bỏ",
  draft: "Bản nháp",
};

const TAB_LABEL: Record<Tab, string> = {
  pending: "Chờ duyệt",
  sent: "Đã gửi",
  rejected: "Đã bỏ",
  all: "Tất cả",
};

const CLEAR_LABEL: Record<Tab, string> = {
  pending: "chờ duyệt",
  sent: "đã gửi",
  rejected: "đã bỏ",
  all: "tất cả",
};

const AVATAR_COLORS = [
  "bg-red-100 text-red-700",
  "bg-orange-100 text-orange-700",
  "bg-amber-100 text-amber-700",
  "bg-green-100 text-green-700",
  "bg-teal-100 text-teal-700",
  "bg-sky-100 text-sky-700",
  "bg-indigo-100 text-indigo-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return new Intl.NumberFormat("vi-VN").format(v) + "đ";
}

function intentBadge(intent: string | null): string {
  if (intent === "buy") return "Nhu cầu mua";
  if (intent === "question") return "Câu hỏi";
  return intent || "—";
}

export default function AdvisoryPage() {
  const [tab, setTab] = useState<Tab>("pending");

  // Single-post analyze
  const [analyzeText, setAnalyzeText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AiAnalyzeResult | null>(
    null,
  );

  // Batch generate options
  const [genGroupId, setGenGroupId] = useState<string>("all");
  const [scanLimit, setScanLimit] = useState("60");
  const [maxPerGroup, setMaxPerGroup] = useState("5");
  const [generating, setGenerating] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<Advisory | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Approve / clear confirm dialogs
  const [approveTarget, setApproveTarget] = useState<Advisory | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { data: groupsResp } = useApi<GroupsResponse>("/api/groups");
  const groups = useMemo(() => groupsResp?.groups ?? [], [groupsResp]);

  const {
    data: advisoryResp,
    loading,
    error,
    reload,
  } = useApi<{ advisories: Advisory[] }>(
    `/api/advisories?status=${tab === "all" ? "" : tab}`,
  );

  const advisories: Advisory[] = useMemo(
    () => advisoryResp?.advisories ?? [],
    [advisoryResp],
  );

  const handleAnalyze = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!analyzeText.trim()) {
        toast.error("Hãy dán nội dung bài viết để phân tích.");
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
        toast.success("Phân tích hoàn tất.");
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Phân tích thất bại.");
      } finally {
        setAnalyzing(false);
      }
    },
    [analyzeText, reload],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const num = (s: string, def: number, min: number, max: number) => {
        const n = parseInt(s, 10);
        if (!Number.isFinite(n)) return def;
        return Math.min(max, Math.max(min, n));
      };
      const body: Record<string, unknown> = {
        scanLimit: num(scanLimit, 60, 1, 300),
        maxPerGroup: num(maxPerGroup, 5, 1, 50),
      };
      if (genGroupId !== "all") body.groupId = genGroupId;

      const res = await apiFetch<GenerateAdvisoriesResult>(
        "/api/ai/generate-advisories",
        { method: "POST", body },
      );
      if (!res.ok) {
        toast.error(res.error || "Tạo nháp thất bại.");
        return;
      }
      toast.success(`Đã tạo ${res.created ?? 0} nháp tư vấn.`, {
        description: `Đã quét ${res.scanned ?? 0} bài → tạo ${res.created ?? 0} nháp (cần kiểm tra: ${res.flagged ?? 0}, bỏ qua đã có: ${res.skippedExisting ?? 0}, không khớp ý định: ${res.ignored ?? 0}, không có hàng: ${res.noProduct ?? 0}).`,
      });
      setTab("pending");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tạo nháp thất bại.");
    } finally {
      setGenerating(false);
    }
  }, [scanLimit, maxPerGroup, genGroupId, reload]);

  const openEdit = useCallback((a: Advisory) => {
    setEditTarget(a);
    setEditText(a.reply ?? a.content ?? "");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      await apiFetch(`/api/advisories/${encodeURIComponent(editTarget.postId)}`, {
        method: "PATCH",
        body: { reply: editText },
      });
      toast.success("Đã lưu nháp trả lời.");
      setEditTarget(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lưu thất bại.");
    } finally {
      setSavingEdit(false);
    }
  }, [editTarget, editText, reload]);

  const doApprove = useCallback(
    async (a: Advisory) => {
      try {
        await apiFetch("/api/ai/approve-advisory", {
          method: "POST",
          body: { postId: a.postId },
        });
        toast.success("Đã duyệt & đưa vào hàng đợi gửi.");
        setApproveTarget(null);
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Duyệt thất bại.");
      }
    },
    [reload],
  );

  const approveAdvisory = useCallback(
    (a: Advisory) => {
      if (a.needsHumanCheck) {
        setApproveTarget(a);
      } else {
        void doApprove(a);
      }
    },
    [doApprove],
  );

  const rejectAdvisory = useCallback(
    async (a: Advisory) => {
      try {
        await apiFetch(`/api/advisories/${encodeURIComponent(a.postId)}`, {
          method: "PATCH",
          body: { status: "rejected" },
        });
        toast.success("Đã bỏ nháp.");
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Bỏ nháp thất bại.");
      }
    },
    [reload],
  );

  const deleteAdvisory = useCallback(
    async (a: Advisory) => {
      try {
        await apiFetch(`/api/advisories/${encodeURIComponent(a.postId)}`, {
          method: "DELETE",
        });
        toast.success("Đã xóa nháp.");
        reload();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Xóa thất bại.");
      }
    },
    [reload],
  );

  const clearAll = useCallback(async () => {
    setClearing(true);
    try {
      for (const a of advisories) {
        await apiFetch(`/api/advisories/${encodeURIComponent(a.postId)}`, {
          method: "DELETE",
        });
      }
      toast.success(`Đã xóa toàn bộ nháp ở mục "${CLEAR_LABEL[tab]}".`);
      setClearOpen(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xóa hàng loạt thất bại.");
    } finally {
      setClearing(false);
    }
  }, [advisories, tab, reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tư vấn bán hàng"
        description="Tư vấn bán hàng bằng AI — phân tích bài viết, soạn câu trả lời và quản lý trước khi gửi."
      />

      {/* Batch generate */}
      <div className="space-y-4 rounded-lg border p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <h3 className="text-sm font-medium">Tạo nháp hàng loạt</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Nhóm</Label>
            <Select value={genGroupId} onValueChange={setGenGroupId}>
              <SelectTrigger>
                <SelectValue placeholder="Tất cả nhóm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhóm</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.groupId} value={g.groupId}>
                    {g.groupName || g.groupId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scan-limit">Số bài quét tối đa</Label>
            <Input
              id="scan-limit"
              type="number"
              min={1}
              max={300}
              value={scanLimit}
              onChange={(e) => setScanLimit(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-per-group">Tối đa mỗi nhóm</Label>
            <Input
              id="max-per-group"
              type="number"
              min={1}
              max={50}
              value={maxPerGroup}
              onChange={(e) => setMaxPerGroup(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={handleGenerate} disabled={generating}>
          <Sparkles className="mr-2 h-4 w-4" />
          {generating ? "Đang tạo nháp…" : "Tạo nháp tư vấn"}
        </Button>
      </div>

      {/* Analyze form */}
      <form onSubmit={handleAnalyze} className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="adv-text">Phân tích một bài viết</Label>
          <Textarea
            id="adv-text"
            rows={4}
            placeholder="Dán nội dung bài viết tại đây để phân tích đầy đủ (phân loại + sản phẩm + tư vấn)…"
            value={analyzeText}
            onChange={(e) => setAnalyzeText(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={analyzing || !analyzeText.trim()}>
          <Search className="mr-2 h-4 w-4" />
          {analyzing ? "Đang phân tích…" : "Phân tích bài viết"}
        </Button>
      </form>

      {/* Analysis result */}
      {analyzeResult && (
        <div className="space-y-3 rounded-lg border border-dashed p-6">
          <h3 className="text-sm font-medium">Kết quả phân tích</h3>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">
              {intentBadge(analyzeResult.advisory.intent)}
            </Badge>
            {analyzeResult.products.length > 0 && (
              <Badge variant="outline">
                Khớp {analyzeResult.products.length} sản phẩm
              </Badge>
            )}
            {analyzeResult.advisory.needsHumanCheck && (
              <Badge variant="destructive">Cần xem lại</Badge>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {analyzeResult.advisory.reply ?? analyzeResult.advisory.content}
          </p>
          {analyzeResult.products.length > 0 && (
            <div className="text-xs">
              <span className="font-medium">Sản phẩm khớp: </span>
              {analyzeResult.products.map((p) => p.name).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Tabs + clear */}
      <div className="flex items-center justify-between border-b pb-px">
        <div className="flex gap-1">
          {(["pending", "sent", "rejected", "all"] as Tab[]).map((t) => (
            <Button
              key={t}
              variant={tab === t ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </Button>
          ))}
        </div>
        {advisories.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setClearOpen(true)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Xóa hết
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && advisories.length === 0 && (
        <EmptyState
          title="Chưa có tư vấn"
          description="Chưa có bản nháp tư vấn nào trong mục này."
        />
      )}

      {advisories.map((a) => {
        const author = a.authorName?.trim() || "Ẩn danh";
        const isPending = a.status === "pending" || a.status === "draft" || !a.status;
        return (
          <div key={a.postId} className="space-y-3 rounded-lg border p-4">
            {/* Header: avatar + author + group + status + date */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar size="sm">
                  <AvatarFallback className={colorFor(author)}>
                    {initials(author)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{author}</div>
                  {a.groupName && (
                    <div className="truncate text-xs text-muted-foreground">
                      {a.groupName}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary">{intentBadge(a.intent)}</Badge>
                <Badge
                  variant={a.status ? STATUS_VARIANT[a.status] ?? "outline" : "outline"}
                  className="flex items-center gap-1"
                >
                  {a.status ? STATUS_ICON[a.status] ?? <FileText className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {a.status ? STATUS_LABEL[a.status] ?? a.status : "Bản nháp"}
                </Badge>
              </div>
            </div>

            {/* Original post text */}
            {a.postText && (
              <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                {a.postText}
              </p>
            )}

            {/* Reply draft */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Nháp trả lời
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {a.reply ?? a.content}
              </p>
            </div>

            {/* Used products */}
            {a.usedProducts && a.usedProducts.length > 0 && (
              <div className="space-y-1 rounded-md border p-3">
                <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Sản phẩm gợi ý
                </div>
                <ul className="space-y-1 text-sm">
                  {a.usedProducts.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2">
                      <span>{p.name ?? "Sản phẩm"}</span>
                      {p.price != null && (
                        <span className="text-muted-foreground">
                          {fmtPrice(p.price)}
                        </span>
                      )}
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                        >
                          xem <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Needs human check */}
            {a.needsHumanCheck && (
              <div className="flex items-center gap-1 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>{a.checkNote ?? "Cần người xem lại trước khi gửi."}</span>
              </div>
            )}

            {/* Meta: confidence + permalink */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {a.confidence && <span>Độ tin cậy: {a.confidence}</span>}
              {a.permalink && (
                <a
                  href={a.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary hover:underline"
                >
                  Mở bài gốc <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              {isPending ? (
                <>
                  <Button size="sm" onClick={() => approveAdvisory(a)}>
                    <Shield className="mr-1 h-3.5 w-3.5" />
                    Duyệt &amp; gửi
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Sửa
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectAdvisory(a)}
                  >
                    <XCircle className="mr-1 h-3.5 w-3.5" />
                    Bỏ
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteAdvisory(a)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Xóa
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => deleteAdvisory(a)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Xóa
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* Edit dialog */}
      <Dialog
        open={editTarget != null}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa nháp trả lời</DialogTitle>
            <DialogDescription>
              Kiểm tra kỹ giá và thông tin sản phẩm. Hệ thống không tự sửa giá.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Hủy
            </Button>
            <Button onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve-with-warning dialog */}
      <Dialog
        open={approveTarget != null}
        onOpenChange={(o) => !o && setApproveTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nháp này cần kiểm tra</DialogTitle>
            <DialogDescription>
              {approveTarget?.checkNote ??
                "Hệ thống đánh dấu nháp này cần người xem lại trước khi gửi."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Hủy
            </Button>
            <Button
              onClick={() => approveTarget && doApprove(approveTarget)}
            >
              Vẫn duyệt &amp; gửi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear-all confirm dialog */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xóa toàn bộ nháp</DialogTitle>
            <DialogDescription>
              Xóa toàn bộ {advisories.length} nháp ở mục &quot;{CLEAR_LABEL[tab]}
              &quot;? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={clearAll} disabled={clearing}>
              {clearing ? "Đang xóa…" : "Xóa hết"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
