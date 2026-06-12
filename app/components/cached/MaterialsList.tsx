"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { MaterialService } from "@/lib/services/material.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function MaterialsList() {
  cacheLife("days");
  cacheTag(CACHE_TAGS.MATERIALS);

  const materials = await MaterialService.getAll();

  return (
    <div className="space-y-4">
      {materials.map((material) => (
        <div key={material.id} className="border rounded-lg p-4">
          <h3 className="font-semibold text-lg">{material.name}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Unit: </span>
              <span className="font-medium">{material.unit}</span>
            </div>
            <div>
              <span className="text-gray-600">Current: </span>
              <span className="font-medium">{material.currentQuantity}</span>
            </div>
            <div>
              <span className="text-gray-600">Minimum: </span>
              <span className="font-medium">{material.minimumQuantity}</span>
            </div>
            <div>
              {material.currentQuantity < material.minimumQuantity && (
                <span className="text-red-600 font-semibold">Low Stock</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
