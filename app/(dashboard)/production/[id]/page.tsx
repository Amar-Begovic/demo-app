import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { EditProductionOrderView } from "./edit-production-order-view";
import ProductionOrderDetailPage from "./production-order-detail";

async function getOrderWithItems(id: string) {
  const order = await prisma.productionOrder.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          article: { select: { id: true, name: true } },
          fabric: { select: { id: true, name: true } },
          rucka: { select: { id: true, name: true } },
          paspul: { select: { id: true, name: true } },
          nogice1: { select: { id: true, name: true } },
          nogice2: { select: { id: true, name: true } },
        },
      },
    },
  });
  return order;
}

async function getDropdownData() {
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

  return {
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
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [order, dropdownData] = await Promise.all([
    getOrderWithItems(id),
    getDropdownData(),
  ]);

  if (!order) {
    notFound();
  }

  // Transform order data to match the EditProductionOrderView expected shape
  const orderForEdit = {
    id: order.id,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    documentNumber: order.documentNumber,
    deliveryLocation: order.deliveryLocation,
    receivedBy: order.receivedBy,
    items: order.items.map((item) => ({
      id: item.id,
      articleId: item.articleId,
      quantity: item.quantity,
      fabricId: item.fabricId,
      ruckaId: item.ruckaId,
      paspulId: item.paspulId,
      nogice1Id: item.nogice1Id,
      nogice2Id: item.nogice2Id,
      withLegs: item.withLegs,
      deliveryDeadline: item.deliveryDeadline?.toISOString() ?? null,
      priority: item.priority,
      notes: item.notes,
      customerOrderNumber: item.customerOrderNumber,
      loadingNumber: item.loadingNumber,
      loadingSequence: item.loadingSequence,
      serialNumber: item.serialNumber,
      step: item.step,
      article: item.article,
      fabric: item.fabric,
      rucka: item.rucka,
      paspul: item.paspul,
      nogice1: item.nogice1,
      nogice2: item.nogice2,
    })),
  };

  return (
    <div className="space-y-6">
      <EditProductionOrderView
        order={orderForEdit}
        articles={dropdownData.articles}
        fabrics={dropdownData.fabrics}
        partners={dropdownData.partners}
        rucke={dropdownData.rucke}
        paspuli={dropdownData.paspuli}
        nogice={dropdownData.nogice}
      />
      <ProductionOrderDetailPage id={id} />
    </div>
  );
}
