"use client";

/**
 * AuthGuard — chặn truy cập trang khi chưa đăng nhập hoặc thiếu quyền.
 *
 * - Chưa đăng nhập → điều hướng tới /login.
 * - requireAdmin=true mà user không phải admin → hiện thông báo "không đủ quyền".
 * - Trong lúc khôi phục phiên (loading) → hiện skeleton để tránh nháy UI.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthGuard({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const router = useRouter();
  const { isAuthenticated, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  // Đang khôi phục phiên: khung chờ thay vì spinner (DESIGN.md: skeleton, không spinner).
  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-dvh flex-col gap-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="max-w-sm text-center">
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Không đủ quyền truy cập
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Khu vực này chỉ dành cho quản trị viên.
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
