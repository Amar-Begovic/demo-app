"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { DepartmentService } from "@/lib/services/department.service";
import { CACHE_TAGS } from "@/lib/cache/config";

export async function DepartmentsList() {
  cacheLife("max");
  cacheTag(CACHE_TAGS.DEPARTMENTS);

  const departments = await DepartmentService.getAll();

  return (
    <div className="space-y-4">
      {departments.map((department) => (
        <div key={department.id} className="border rounded-lg p-4">
          <h3 className="font-semibold text-lg">{department.name}</h3>
          {department.description && (
            <p className="text-sm text-gray-600 mt-1">{department.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
