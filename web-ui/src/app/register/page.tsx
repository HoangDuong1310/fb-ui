"use client";

/**
 * Trang đăng ký — tạo tài khoản mới cho dashboard.
 *
 * Tài khoản mới mặc định ở trạng thái 'pending' (chờ admin duyệt), nên backend
 * KHÔNG trả token. Sau khi đăng ký thành công ta hiển thị thông báo chờ duyệt
 * và mời người dùng quay lại trang đăng nhập.
 *
 * Xử lý các nhánh phản hồi từ /api/auth/register:
 *   - 201: đăng ký thành công → hiện message "chờ duyệt".
 *   - 400: dữ liệu không hợp lệ (email sai định dạng, mật khẩu < 6 ký tự…).
 *   - 409: email đã được đăng ký.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function RegisterPage() {
  const router = useRouter();
  const { register, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Đã đăng nhập rồi thì khỏi ở lại trang đăng ký.
  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/");
    }
  }, [loading, isAuthenticated, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Kiểm tra phía client trước khi gọi API (khớp ràng buộc của backend).
    if (password.length < 6 || password.length > 72) {
      setError("Mật khẩu phải từ 6 đến 72 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await register(
        email.trim(),
        password,
        displayName.trim() || undefined,
      );
      setSuccess(res.message);
      // Dọn form sau khi đăng ký thành công.
      setEmail("");
      setDisplayName("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      if (err instanceof ApiError) {
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
            Tạo tài khoản
          </CardTitle>
          <CardDescription>
            Đăng ký tài khoản mới. Tài khoản cần được admin duyệt trước khi đăng
            nhập.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <p
                role="status"
                className="rounded-md bg-muted p-3 text-sm text-foreground"
              >
                {success}
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Về trang đăng nhập</Link>
              </Button>
            </div>
          ) : (
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
                <Label htmlFor="displayName">Tên hiển thị (tuỳ chọn)</Label>
                <Input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Xác nhận mật khẩu</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                {submitting ? "Đang đăng ký…" : "Đăng ký"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Đã có tài khoản?{" "}
                <Link
                  href="/login"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  Đăng nhập
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
