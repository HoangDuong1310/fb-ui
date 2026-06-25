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
        toast.error("Paste or type the post content first.");
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
        toast.success("Post spun successfully");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Spin failed");
      } finally {
        setSpinning(false);
      }
    },
    [text, tone, style, maxLen],
  );

  const copyResult = useCallback(() => {
    if (!result?.content) return;
    navigator.clipboard.writeText(result.content).then(
      () => toast.success("Copied to clipboard"),
      () => toast.error("Copy failed"),
    );
  }, [result]);

  const useAsInput = useCallback(() => {
    if (!result?.content) return;
    setText(result.content);
    setResult(null);
    toast.info("Moved result to input for re-spinning");
  }, [result]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auto Post"
        description="Rewrite post content with AI — paste a post, pick tone & style, and spin."
      />

      <form onSubmit={handleSpin} className="space-y-4 rounded-lg border p-6">
        <div className="space-y-2">
          <Label htmlFor="post-text">Post Content</Label>
          <Textarea
            id="post-text"
            rows={6}
            placeholder="Paste or type the original post here…"
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
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger>
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="engaging">Engaging</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-len">Max Length</Label>
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
          {spinning ? "Spinning…" : "Spin Post"}
        </Button>
      </form>

      {result && (
        <div className="space-y-3 rounded-lg border border-dashed p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Spun Result</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyResult}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={useAsInput}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Use as Input
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
