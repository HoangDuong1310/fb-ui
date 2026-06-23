/**
 * Layout cho nhóm route (dashboard) — vỏ chung của toàn bộ trang đã đăng nhập.
 *
 * Cấu trúc: AuthGuard (chặn chưa đăng nhập) → SidebarProvider → AppSidebar +
 * SidebarInset (vùng nội dung) với topbar dính phía trên chứa nút thu/mở sidebar.
 *
 * Mọi trang trong (dashboard)/ tự động được bảo vệ + có sidebar/topbar.
 */

import { AuthGuard } from "@/components/auth-guard";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger aria-label="Thu/mở thanh điều hướng" />
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm text-muted-foreground">
              Bảng điều khiển
            </span>
          </header>
          <div className="flex-1 p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
