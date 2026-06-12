import { prisma } from "@/lib/db";
import type { AuditLog, Prisma } from "@/app/generated/prisma";
import type { PaginatedResponse } from "@/lib/types/pagination";

export const AuditLogService = {
  /**
   * Fire-and-forget audit log entry. Errors are logged to console, never thrown.
   */
  async log(entry: {
    entityType: string;
    entityId: string;
    action: string;
    details: Record<string, unknown>;
    performedBy?: string;
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          details: entry.details as Prisma.InputJsonValue,
          performedBy: entry.performedBy,
        },
      });
    } catch (error) {
      console.error("Greška pri zapisivanju u revizijski dnevnik:", error);
    }
  },

  async getByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { timestamp: "desc" },
    });
  },

  async getAll(filters: {
    entityType?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<AuditLog> & { totalPages: number }> {
    const where: Record<string, unknown> = {};

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.from || filters.to) {
      const timestamp: Record<string, Date> = {};
      if (filters.from) timestamp.gte = filters.from;
      if (filters.to) timestamp.lte = filters.to;
      where.timestamp = timestamp;
    }

    const skip = (filters.page - 1) * filters.pageSize;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take: filters.pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      totalPages: Math.ceil(total / filters.pageSize),
    };
  },
};
