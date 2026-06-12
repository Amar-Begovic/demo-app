"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { PaspulService } from "@/lib/services/paspul.service";
import type { PaspulWithMaterial } from "@/lib/services/paspul.service";
import { CategoryItemsList } from "../components/category-items-list";
import type { CategoryConfig } from "@/lib/types/category-config";
import { createPaspul, updatePaspul, deletePaspul } from "@/app/actions/paspul";

const paspulConfig: CategoryConfig = {
  slug: "paspul",
  title: "Paspul",
  subtitle: "Upravljanje paspul trakama za proizvodnju",
  createButtonLabel: "Novi paspul",
  createDialogTitle: "Dodaj novi paspul",
  createDialogDescription: "Unesite podatke za novi paspul",
  editDialogTitle: "Uredi paspul",
  editDialogDescription: "Izmijenite podatke paspula",
  emptyStateMessage: "Nema paspula u sistemu. Dodajte prvi paspul.",
  deleteConfirmMessage: "Jeste li sigurni da želite obrisati ovaj paspul?",
  cacheTag: "paspul",
};

export async function CachedPaspulList() {
  cacheLife("hours");
  cacheTag("paspul");

  const paspuli: PaspulWithMaterial[] = await PaspulService.getAll();

  const items = paspuli.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    materialId: p.materialId,
    material: p.material,
  }));

  return (
    <CategoryItemsList
      items={items}
      config={paspulConfig}
      createAction={createPaspul}
      updateAction={updatePaspul}
      deleteAction={deletePaspul}
    />
  );
}
