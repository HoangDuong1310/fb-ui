"use client";

/**
 * Trang đăng nhập — cổng vào dashboard.
 *
 * Xử lý 3 nhánh phản hồi từ /api/auth/login:
 *   - 200: lưu token + user, điều hướng về trang chủ theo role.
 *   - 401: sai email/mật khẩu.
 *   - 403: tài khoản pending (chờ duyệt) hoặc locked (bị khóa) — hiện message backend.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập rồi thì khỏi ở lại trang login.
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        // 403 (pending/locked) và 401 (sai thông tin) đều có message tiếng Việt.
        setError(err.message);
      } else {
        setError("Không kết nối được máy chủ. Vui lòng thử lại.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border bg-card">
        <CardHeader className="space-y-1.5">
          <CardTitle
            className="text-xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Group Radar
          </CardTitle>
          <CardDescription>
            Đăng nhập để vào bảng điều khiển.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@vidu.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="text-sm text-[var(--color-danger,oklch(0.64_0.115_25))]"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
