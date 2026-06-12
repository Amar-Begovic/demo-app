"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { SupplierService } from "@/lib/services/supplier.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function SuppliersList() {
  cacheLife("max");
  cacheTag(CACHE_TAGS.SUPPLIERS);

  const suppliers = await SupplierService.getAll();

  return (
    <div className="space-y-4">
      {suppliers.map((supplier) => (
        <div key={supplier.id} className="border rounded-lg p-4">
          <h3 className="font-semibold text-lg">{supplier.companyName}</h3>
          {supplier.code && (
            <p className="text-xs text-gray-500 mt-1">Code: {supplier.code}</p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {supplier.contactEmail && (
              <div>
                <span className="text-gray-600">Email: </span>
                <span className="font-medium">{supplier.contactEmail}</span>
              </div>
            )}
            {supplier.contactPhone && (
              <div>
                <span className="text-gray-600">Phone: </span>
                <span className="font-medium">{supplier.contactPhone}</span>
              </div>
            )}
            {supplier.city && (
              <div>
                <span className="text-gray-600">City: </span>
                <span className="font-medium">{supplier.city}</span>
              </div>
            )}
            {supplier.country && (
              <div>
                <span className="text-gray-600">Country: </span>
                <span className="font-medium">{supplier.country}</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
