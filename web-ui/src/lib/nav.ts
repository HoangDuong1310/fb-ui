/**
 * nav.ts — defined dashboard navigation structure.
 *
 * NAV_GROUPS is read by AppSidebar to render the menu. Each item can mark
 * `adminOnly` to only show for admin accounts.
 */

import type { LucideIcon } from "lucide-react";
import {
  Database,
  FileSignature,
  FileText,
  Globe,
  Hammer,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Package,
  Send,
  Settings,
  Share2,
  Store,
  Tag,
  Terminal,
  UserCog,
  Users,
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
    label: "Overview",
    items: [
      {
        href: "/",
        title: "Tong quan",
        icon: LayoutDashboard,
      },
      {
        href: "/groups",
        title: "Nhom",
        icon: Users,
      },
      {
        href: "/posts",
        title: "Bai viet",
        icon: FileText,
      },
      {
        href: "/group-prices",
        title: "Gia theo nhom",
        icon: Tag,
      },
    ],
  },
  {
    label: "AI & Auto",
    items: [
      {
        href: "/autopost",
        title: "Dang bai tu dong",
        icon: Send,
      },
      {
        href: "/autocomment",
        title: "Binh luan tu dong",
        icon: MessageCircle,
      },
      {
        href: "/advisory",
        title: "Tu van ban hang",
        icon: MessageSquare,
      },
      {
        href: "/conversations",
        title: "Cuoc tro chuyen",
        icon: MessagesSquare,
      },
    ],
  },
  {
    label: "Manage",
    items: [
      {
        href: "/products",
        title: "San pham",
        icon: Package,
      },
      {
        href: "/mystore",
        title: "Cua hang cua toi",
        icon: Store,
      },
      {
        href: "/build",
        title: "Xay bo",
        icon: Hammer,
      },
      {
        href: "/sources",
        title: "Nguon du lieu",
        icon: Globe,
      },
      {
        href: "/keywords",
        title: "Tu khoa",
        icon: KeyRound,
      },
      {
        href: "/sharing",
        title: "Chia se du lieu",
        icon: Share2,
      },
      {
        href: "/profiles",
        title: "Ho so nganh",
        icon: FileSignature,
      },
    ],
  },
  {
    label: "Control",
    items: [
      {
        href: "/remote-commands",
        title: "Lenh tu Web",
        icon: Terminal,
      },
      {
        href: "/settings",
        title: "Cai dat",
        icon: Settings,
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        href: "/admin/data",
        title: "Sua du lieu",
        icon: Database,
        adminOnly: true,
      },
      {
        href: "/admin/users",
        title: "Quan ly nguoi dung",
        icon: UserCog,
        adminOnly: true,
      },
    ],
  },
];
