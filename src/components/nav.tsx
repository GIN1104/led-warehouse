"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  GanttChart,
  History,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Paperclip,
  ScanLine,
  TriangleAlert,
  Truck,
  UserRound,
  Users,
  Warehouse,
  ArrowLeftRight,
} from "lucide-react";
import { useI18n } from "@/components/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: MessageKey; icon: typeof LayoutDashboard };
type NavGroup = { label: MessageKey; items: NavLink[] };

const groups: NavGroup[] = [
  {
    label: "nav.group.overview",
    items: [{ href: "/", label: "nav.overview", icon: LayoutDashboard }],
  },
  {
    label: "nav.group.planning",
    items: [
      { href: "/calendar", label: "nav.calendar", icon: CalendarDays },
      { href: "/orders", label: "nav.orders", icon: ClipboardList },
      { href: "/files", label: "nav.files", icon: Paperclip },
      { href: "/occupancy", label: "nav.occupancy", icon: GanttChart },
      { href: "/shortages", label: "nav.shortages", icon: TriangleAlert },
      { href: "/external-hires", label: "nav.hires", icon: Truck },
      { href: "/tasks", label: "nav.tasks", icon: ListTodo },
    ],
  },
  {
    label: "nav.group.warehouse",
    items: [
      { href: "/stock", label: "nav.stock", icon: Warehouse },
      { href: "/catalog", label: "nav.catalog", icon: Boxes },
      { href: "/locations", label: "nav.locations", icon: MapPin },
      { href: "/transfers", label: "nav.transfers", icon: ArrowLeftRight },
      { href: "/scan", label: "nav.scan", icon: ScanLine },
      { href: "/history", label: "nav.history", icon: History },
    ],
  },
  {
    label: "nav.group.people",
    items: [
      { href: "/me", label: "nav.me", icon: UserRound },
      { href: "/people", label: "nav.people", icon: Users },
      { href: "/access-requests", label: "nav.access", icon: KeyRound },
    ],
  },
  {
    label: "nav.group.system",
    items: [{ href: "/alerts", label: "nav.alerts", icon: Bell }],
  },
];

function isActive(pathname: string, href: string) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return href === "/" ? path === "/" : path.startsWith(href);
}

export function Nav({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav className={cn(compact ? "flex gap-2 overflow-x-auto px-4 py-3" : "flex flex-col gap-3 pb-2")}>
      {groups.map((group) => (
        <div key={group.label} className={cn(compact ? "contents" : "flex flex-col gap-0.5")}>
          {compact ? null : (
            <p className="px-2.5 pt-1 pb-0.5 text-[10px] font-medium tracking-wide text-white/40 uppercase">
              {t(group.label)}
            </p>
          )}
          {group.items.map((link) => {
            const active = isActive(pathname, link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-base leading-snug tracking-tight whitespace-nowrap [@media(max-height:520px)]:py-1",
                  compact ? "gap-2 px-3 py-2 text-sm" : null,
                  compact
                    ? active
                      ? "bg-ink text-paper"
                      : "bg-white text-ink"
                    : active
                      ? "bg-white/10 text-white"
                      : "text-white/75 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon size={compact ? 16 : 17} aria-hidden className="shrink-0" />
                {t(link.label)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
