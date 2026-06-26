"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AiSpinResult } from "@/lib/types";
import { PageHeader } from "@/components/page-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare, Copy, RotateCcw, Sparkles } from "lucide-react";

export default function AutocommentPage() {
  const [text, setText] = useState("");
  const [tone, setTone] = useState("friendly");
  const [language, setLanguage] = useState("vi");
  const [numVariants, setNumVariants] = useState("3");
  const [results, setResults] = useState<AiSpinResult[]>([]);
  const [spinning, setSpinning] = useState(false);

  const handleSpin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim()) {
        toast.error("Hãy nhập bình luận cần viết lại trước.");
        return;
      }
      setSpinning(true);
      setResults([]);
      try {
        const count = parseInt(numVariants, 10) || 3;
        const promises = Array.from({ length: count }, () =>
          apiFetch<AiSpinResult>("/api/ai/spin-post", {
            method: "POST",
            body: {
              text: text.trim(),
              options: { tone, style: "casual", maxLen: 200, type: "comment" },
            },
          }),
        );
        const res = await Promise.all(promises);
        setResults(res);
        toast.success(`Đã tạo ${res.length} biến thể bình luận`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Tạo bình luận thất bại");
      } finally {
        setSpinning(false);
      }
    },
    [text, tone, language, numVariants],
  );

  const copyOne = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(
      () => toast.success("Đã sao chép"),
      () => toast.error("Sao chép thất bại"),
    );
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bình luận tự động"
        description="Tạo nhiều biến thể bình luận từ nội dung của bạn bằng AI."
      />

      <form onSubmit={handleSpin} className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="comment-text">Nội dung bình luận</Label>
          <Textarea
            id="comment-text"
            rows={4}
            placeholder="Nhập hoặc dán bình luận gốc…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Giọng điệu</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue placeholder="Giọng điệu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Thân thiện</SelectItem>
                <SelectItem value="professional">Chuyên nghiệp</SelectItem>
                <SelectItem value="casual">Thoải mái</SelectItem>
                <SelectItem value="enthusiastic">Nhiệt tình</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ngôn ngữ</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue placeholder="Ngôn ngữ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">Tiếng Việt</SelectItem>
                <SelectItem value="en">Tiếng Anh</SelectItem>
                <SelectItem value="auto">Tự động</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Số biến thể</Label>
            <Select value={numVariants} onValueChange={setNumVariants}>
              <SelectTrigger>
                <SelectValue placeholder="Bao nhiêu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 biến thể</SelectItem>
                <SelectItem value="2">2 biến thể</SelectItem>
                <SelectItem value="3">3 biến thể</SelectItem>
                <SelectItem value="5">5 biến thể</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" disabled={spinning || !text.trim()}>
          <MessageSquare className="mr-2 h-4 w-4" />
          {spinning ? "Đang tạo…" : "Tạo bình luận"}
        </Button>
      </form>

      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            Biến thể đã tạo ({results.length})
          </h3>
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border p-4"
            >
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">
                {r.content}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => copyOne(r.content)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
