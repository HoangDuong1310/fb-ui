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
        toast.error("Enter the comment to rewrite first.");
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
        toast.success(`Generated ${res.length} comment variants`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Spin failed");
      } finally {
        setSpinning(false);
      }
    },
    [text, tone, language, numVariants],
  );

  const copyOne = useCallback((content: string) => {
    navigator.clipboard.writeText(content).then(
      () => toast.success("Copied"),
      () => toast.error("Copy failed"),
    );
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto Comment"
        description="Generate multiple comment variants from your text using AI."
      />

      <form onSubmit={handleSpin} className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="comment-text">Comment Content</Label>
          <Textarea
            id="comment-text"
            rows={4}
            placeholder="Type or paste the original comment…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue placeholder="Tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vi">Vietnamese</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">Auto Detect</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Variants</Label>
            <Select value={numVariants} onValueChange={setNumVariants}>
              <SelectTrigger>
                <SelectValue placeholder="How many" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 variant</SelectItem>
                <SelectItem value="2">2 variants</SelectItem>
                <SelectItem value="3">3 variants</SelectItem>
                <SelectItem value="5">5 variants</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button type="submit" disabled={spinning || !text.trim()}>
          <MessageSquare className="mr-2 h-4 w-4" />
          {spinning ? "Generating…" : "Generate Comments"}
        </Button>
      </form>

      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            Generated Variants ({results.length})
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
