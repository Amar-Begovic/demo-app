import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Lightweight endpoint that returns only the data needed for the
 * CreateProductionOrderDialog dropdowns (articles, fabrics, partners,
 * and category items: rucke, paspuli, nogice).
 * This avoids loading the full BOM tree on the production page.
 */
export async function GET() {
  const [articles, fabrics, partners, rucke, paspuli, nogice] = await Promise.all([
    prisma.article.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.fabric.findMany({
      select: { id: true, name: true, color: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { partnerType: { in: ["kupac", "oba"] } },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true, city: true, contactPhone: true, address: true },
    }),
    prisma.rucka.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }).catch(() => []),
    prisma.paspul.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }).catch(() => []),
    prisma.nogica.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }).catch(() => []),
  ]);

  return NextResponse.json({
    articles: articles.map((a) => ({ id: a.id, name: a.name, code: a.code })),
    fabrics: fabrics.map((f) => ({ id: f.id, name: f.name, color: f.color, code: f.code })),
    partners: partners.map((p) => ({
      id: p.id,
      companyName: p.companyName,
      city: p.city,
      phone: p.contactPhone,
      address: p.address,
    })),
    rucke: rucke.map((r) => ({ id: r.id, name: r.name })),
    paspuli: paspuli.map((p) => ({ id: p.id, name: p.name })),
    nogice: nogice.map((n) => ({ id: n.id, name: n.name })),
  });
}
