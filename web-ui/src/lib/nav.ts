/**
 * Cấu hình điều hướng sidebar — nhóm theo "việc cần làm" (DESIGN.md).
 *
 * Mỗi mục có cờ adminOnly để ẩn khỏi user thường. Icon dùng lucide-react
 * (đi kèm shadcn). Đường dẫn khớp với cấu trúc app router trong (dashboard)/.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users2,
  FileText,
  Tags,
  ShieldCheck,
  Database,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Khám phá",
    items: [
      { title: "Tổng quan", href: "/", icon: LayoutDashboard },
      { title: "Nhóm", href: "/groups", icon: Users2 },
      { title: "Bài viết", href: "/posts", icon: FileText },
    ],
  },
  {
    label: "Giá & Kho",
    items: [{ title: "Giá theo nhóm", href: "/group-prices", icon: Tags }],
  },
  {
    label: "Hệ thống",
    items: [
      {
        title: "Quản lý người dùng",
        href: "/admin/users",
        icon: ShieldCheck,
        adminOnly: true,
      },
      {
        title: "Sửa dữ liệu",
        href: "/admin/data",
        icon: Database,
        adminOnly: true,
      },
    ],
  },
];
