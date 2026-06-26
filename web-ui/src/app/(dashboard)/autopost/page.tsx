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
import { Wand2, Copy, RotateCcw } from "lucide-react";

export default function AutopostPage() {
  const [text, setText] = useState("");
  const [tone, setTone] = useState("friendly");
  const [style, setStyle] = useState("casual");
  const [maxLen, setMaxLen] = useState("500");
  const [result, setResult] = useState<AiSpinResult | null>(null);
  const [spinning, setSpinning] = useState(false);

  const handleSpin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!text.trim()) {
        toast.error("Hãy dán hoặc nhập nội dung bài viết trước.");
        return;
      }
      setSpinning(true);
      setResult(null);
      try {
        const res = await apiFetch<AiSpinResult>("/api/ai/spin-post", {
          method: "POST",
          body: {
            text: text.trim(),
            options: {
              tone,
              style,
              maxLen: parseInt(maxLen, 10) || 500,
            },
          },
        });
        setResult(res);
        toast.success("Cải biên bài viết thành công");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Cải biên thất bại");
      } finally {
        setSpinning(false);
      }
    },
    [text, tone, style, maxLen],
  );

  const copyResult = useCallback(() => {
    if (!result?.content) return;
    navigator.clipboard.writeText(result.content).then(
      () => toast.success("Đã sao chép"),
      () => toast.error("Sao chép thất bại"),
    );
  }, [result]);

  const useAsInput = useCallback(() => {
    if (!result?.content) return;
    setText(result.content);
    setResult(null);
    toast.info("Đã chuyển kết quả vào ô nhập để cải biên lại");
  }, [result]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đăng bài tự động"
        description="Viết lại nội dung bài viết bằng AI — dán bài viết, chọn giọng điệu & phong cách, rồi cải biên."
      />

      <form onSubmit={handleSpin} className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="post-text">Nội dung bài viết</Label>
          <Textarea
            id="post-text"
            rows={6}
            placeholder="Dán hoặc nhập bài viết gốc tại đây…"
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
                <SelectItem value="urgent">Khẩn cấp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Phong cách</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger>
                <SelectValue placeholder="Phong cách" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Thoải mái</SelectItem>
                <SelectItem value="formal">Trang trọng</SelectItem>
                <SelectItem value="concise">Súc tích</SelectItem>
                <SelectItem value="engaging">Thu hút</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-len">Độ dài tối đa</Label>
            <Input
              id="max-len"
              type="number"
              min={100}
              max={2000}
              value={maxLen}
              onChange={(e) => setMaxLen(e.target.value)}
            />
          </div>
        </div>

        <Button type="submit" disabled={spinning || !text.trim()}>
          <Wand2 className="mr-2 h-4 w-4" />
          {spinning ? "Đang cải biên…" : "Cải biên bài viết"}
        </Button>
      </form>

      {result && (
        <div className="space-y-3 rounded-lg border border-dashed p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Kết quả cải biên</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyResult}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Sao chép
              </Button>
              <Button variant="outline" size="sm" onClick={useAsInput}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Dùng làm đầu vào
              </Button>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {result.content}
          </p>
        </div>
      )}
    </div>
  );
}
