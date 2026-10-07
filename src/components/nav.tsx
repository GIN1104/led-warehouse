"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Boxes, ClipboardList, LayoutDashboard, MapPin, ScanLine, Truck, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Обзор", icon: LayoutDashboard },
  { href: "/catalog", label: "Номенклатура", icon: Boxes },
  { href: "/locations", label: "Локации", icon: MapPin },
  { href: "/stock", label: "Остатки", icon: Warehouse },
  { href: "/scan", label: "Сканирование", icon: ScanLine },
  { href: "/orders", label: "Заказы", icon: ClipboardList },
  { href: "/alerts", label: "Сигналы", icon: Bell },
  { href: "/external-hires", label: "Внешняя аренда", icon: Truck },
];

export function Nav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={cn(compact ? "flex gap-2 overflow-x-auto px-4 py-3" : "flex flex-col gap-1")}>
      {links.map((link) => {
        const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap",
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
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
