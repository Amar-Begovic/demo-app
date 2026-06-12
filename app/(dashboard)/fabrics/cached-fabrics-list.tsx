"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { FabricService } from "@/lib/services/fabric.service";
import type { FabricWithMaterial } from "@/lib/services/fabric.service";
import { FabricsList } from "./components/fabrics-list";

export async function CachedFabricsList() {
  cacheLife("hours");
  cacheTag("fabrics");

  const fabrics: FabricWithMaterial[] = await FabricService.getAll();

  return <FabricsList fabrics={fabrics} />;
}
