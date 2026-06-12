import { Suspense } from "react";
import Link from "next/link";
import { NavLink } from "./components/nav-link";
import { LogoutButton } from "./components/logout-button";

const navItems = [
  { href: "/", label: "Početna", iconName: "Home" },
  { href: "/materials", label: "Materijali", iconName: "Package" },
  { href: "/fabrics", label: "Stofovi", iconName: "Shirt" },
  { href: "/nogice", label: "Nogice", iconName: "Footprints" },
  { href: "/rucke", label: "Ručke", iconName: "Grip" },
  { href: "/paspul", label: "Paspul", iconName: "Ribbon" },
  { href: "/articles", label: "Artikli", iconName: "Layers" },
  { href: "/departments", label: "Odjeli", iconName: "Building2" },
  { href: "/suppliers", label: "Dobavljači", iconName: "Truck" },
  { href: "/production", label: "Proizvodni nalozi", iconName: "ClipboardList" },
  { href: "/production/obrisani", label: "Obrisani", iconName: "Trash2" },
  { href: "/purchase", label: "Nabavka", iconName: "ShoppingCart" },
  { href: "/scan", label: "Skeniranje", iconName: "ScanBarcode" },
  { href: "/reports", label: "Izvještaji", iconName: "BarChart3" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6 border-b">
          <Link href="/" className="text-xl font-bold tracking-tight">
            ProTrack
          </Link>
          <p className="text-xs text-muted-foreground mt-1">
            ProTrack v1.0.3
          </p>
        </div>
        <Suspense>
          <nav className="flex-1 p-4 space-y-1" aria-label="Glavna navigacija">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                iconName={item.iconName}
              />
            ))}
          </nav>
        </Suspense>
        <div className="p-4 border-t">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
