/**
 * nav.ts — định nghĩa cấu trúc điều hướng của dashboard.
 *
 * NAV_GROUPS được AppSidebar đọc để dựng menu. Mỗi mục có thể đánh dấu
 * `adminOnly` để chỉ hiển thị với tài khoản admin.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Tag,
  Database,
  UserCog,
  Terminal,
} from "lucide-react";

export interface NavItem {
  href: string;
  title: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dữ liệu",
    items: [
      { href: "/", title: "Tổng quan", icon: LayoutDashboard },
      { href: "/groups", title: "Nhóm", icon: Users },
      { href: "/posts", title: "Bài viết", icon: FileText },
      { href: "/group-prices", title: "Giá theo nhóm", icon: Tag },
    ],
  },
  {
    label: "Điều khiển",
    items: [
      { href: "/remote-commands", title: "Lệnh từ Web", icon: Terminal },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { href: "/admin/data", title: "Sửa dữ liệu", icon: Database, adminOnly: true },
      { href: "/admin/users", title: "Quản lý người dùng", icon: UserCog, adminOnly: true },
    ],
  },
];
