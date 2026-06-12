"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Package,
  Layers,
  Building2,
  Truck,
  ClipboardList,
  ShoppingCart,
  ScanBarcode,
  BarChart3,
  Home,
  Shirt,
  Trash2,
  Footprints,
  Grip,
  Ribbon,
} from "lucide-react";
import type { ComponentType } from "react";

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  Home,
  Package,
  Layers,
  Building2,
  Truck,
  ClipboardList,
  ShoppingCart,
  ScanBarcode,
  BarChart3,
  Shirt,
  Trash2,
  Footprints,
  Grip,
  Ribbon,
};

interface NavLinkProps {
  href: string;
  label: string;
  iconName: string;
}

export function NavLink({ href, label, iconName }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  const Icon = iconMap[iconName] ?? Home;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
