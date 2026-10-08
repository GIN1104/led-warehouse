"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Boxes, ClipboardList, LayoutDashboard, MapPin, ScanLine, Truck, Warehouse } from "lucide-react";
import { useI18n } from "@/components/i18n";
import type { MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

const links: { href: string; label: MessageKey; icon: typeof LayoutDashboard }[] = [
  { href: "/", label: "nav.overview", icon: LayoutDashboard },
  { href: "/catalog", label: "nav.catalog", icon: Boxes },
  { href: "/locations", label: "nav.locations", icon: MapPin },
  { href: "/stock", label: "nav.stock", icon: Warehouse },
  { href: "/scan", label: "nav.scan", icon: ScanLine },
  { href: "/orders", label: "nav.orders", icon: ClipboardList },
  { href: "/alerts", label: "nav.alerts", icon: Bell },
  { href: "/external-hires", label: "nav.hires", icon: Truck },
];

export function Nav({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav className={cn(compact ? "flex gap-2 overflow-x-auto px-4 py-3" : "flex flex-col gap-1")}>
      {links.map((link) => {
        const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
        const active = link.href === "/" ? path === "/" : path.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap [@media(max-height:520px)]:py-1.5",
              compact
                ? active
                  ? "bg-ink text-paper"
                  : "bg-white text-ink"
                : active
                  ? "bg-white/10 text-white"
                  : "text-white/75 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon size={16} aria-hidden />
            {t(link.label)}
          </Link>
        );
      })}
    </nav>
  );
}
