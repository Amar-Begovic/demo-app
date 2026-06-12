import { prisma } from "@/lib/db";
import type { Supplier } from "@/app/generated/prisma";
import type { PaginationParams, PaginatedResponse } from "@/lib/types/pagination";

export interface CreateSupplierInput {
  companyName: string;
  code?: string;
  type?: string;
  vatStatus?: string;
  vatNumber?: string;
  registration?: string;
  country?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  materialIds?: string[];
}

export interface UpdateSupplierInput {
  companyName?: string;
  code?: string;
  type?: string;
  vatStatus?: string;
  vatNumber?: string;
  registration?: string;
  country?: string;
  city?: string;
  postalCode?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  materialIds?: string[];
}

const supplierInclude = {
  materials: {
    include: {
      material: true,
    },
  },
} as const;

export const SupplierService = {
  async create(data: CreateSupplierInput): Promise<Supplier> {
    // Validate referenced materials exist
    if (data.materialIds && data.materialIds.length > 0) {
      const materials = await prisma.material.findMany({
        where: { id: { in: data.materialIds } },
        select: { id: true },
      });
      const foundIds = new Set(materials.map((m) => m.id));
      const missing = data.materialIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new Error(`Materials not found: ${missing.join(", ")}`);
      }
    }

    return prisma.supplier.create({
      data: {
        companyName: data.companyName,
        code: data.code ?? null,
        type: data.type ?? null,
        vatStatus: data.vatStatus ?? null,
        vatNumber: data.vatNumber ?? null,
        registration: data.registration ?? null,
        country: data.country ?? null,
        city: data.city ?? null,
        postalCode: data.postalCode ?? null,
        address: data.address ?? null,
        contactEmail: data.contactEmail ?? null,
        contactPhone: data.contactPhone ?? null,
        materials: data.materialIds
          ? {
              create: data.materialIds.map((materialId) => ({
                materialId,
              })),
            }
          : undefined,
      },
      include: supplierInclude,
    });
  },

  async getAll(): Promise<Supplier[]> {
    return prisma.supplier.findMany({
      include: supplierInclude,
      orderBy: { companyName: "asc" },
    });
  },

  async getAllPaginated({ page, pageSize }: PaginationParams): Promise<PaginatedResponse<{
    id: string;
    companyName: string;
    code: string | null;
    city: string | null;
    country: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    materials: { material: { id: string; name: string; unit: string } }[];
  }>> {
    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      prisma.supplier.findMany({
        select: {
          id: true,
          companyName: true,
          code: true,
          city: true,
          country: true,
          contactEmail: true,
          contactPhone: true,
          materials: {
            select: {
              material: { select: { id: true, name: true, unit: true } },
            },
          },
        },
        skip,
        take: pageSize,
        orderBy: { companyName: "asc" },
      }),
      prisma.supplier.count(),
    ]);
    return { data, total, page, pageSize };
  },

  async getById(id: string): Promise<Supplier | null> {
    return prisma.supplier.findUnique({
      where: { id },
      include: supplierInclude,
    });
  },

  async update(id: string, data: UpdateSupplierInput): Promise<Supplier> {
    // If materialIds provided, replace all linked materials
    if (data.materialIds !== undefined) {
      // Validate referenced materials exist
      if (data.materialIds.length > 0) {
        const materials = await prisma.material.findMany({
          where: { id: { in: data.materialIds } },
          select: { id: true },
        });
        const foundIds = new Set(materials.map((m) => m.id));
        const missing = data.materialIds.filter((mid) => !foundIds.has(mid));
        if (missing.length > 0) {
          throw new Error(`Materials not found: ${missing.join(", ")}`);
        }
      }

      // Delete existing links and recreate
      await prisma.supplierMaterial.deleteMany({
        where: { supplierId: id },
      });

      return prisma.supplier.update({
        where: { id },
        data: {
          companyName: data.companyName,
          code: data.code,
          type: data.type,
          vatStatus: data.vatStatus,
          vatNumber: data.vatNumber,
          registration: data.registration,
          country: data.country,
          city: data.city,
          postalCode: data.postalCode,
          address: data.address,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          materials: {
            create: data.materialIds.map((materialId) => ({
              materialId,
            })),
          },
        },
        include: supplierInclude,
      });
    }

    return prisma.supplier.update({
      where: { id },
      data: {
        companyName: data.companyName,
        code: data.code,
        type: data.type,
        vatStatus: data.vatStatus,
        vatNumber: data.vatNumber,
        registration: data.registration,
        country: data.country,
        city: data.city,
        postalCode: data.postalCode,
        address: data.address,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
      },
      include: supplierInclude,
    });
  },
};
