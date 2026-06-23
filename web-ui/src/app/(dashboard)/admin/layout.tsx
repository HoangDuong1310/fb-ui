import { AuthGuard } from "@/components/auth-guard";

/**
 * Layout cho khu vực /admin — chỉ tài khoản có role "admin" mới vào được.
 * AuthGuard requireAdmin sẽ chặn và hiển thị thông báo nếu không đủ quyền.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard requireAdmin>{children}</AuthGuard>;
}
