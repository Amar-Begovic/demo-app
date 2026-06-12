"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { RuckaService } from "@/lib/services/rucka.service";
import type { RuckaWithMaterial } from "@/lib/services/rucka.service";
import { CategoryItemsList } from "../components/category-items-list";
import type { CategoryConfig } from "@/lib/types/category-config";
import { createRucka, updateRucka, deleteRucka } from "@/app/actions/rucke";

const ruckeConfig: CategoryConfig = {
  slug: "rucke",
  title: "Ručke",
  subtitle: "Upravljanje ručkama za proizvodnju",
  createButtonLabel: "Nova ručka",
  createDialogTitle: "Dodaj novu ručku",
  createDialogDescription: "Unesite podatke za novu ručku",
  editDialogTitle: "Uredi ručku",
  editDialogDescription: "Izmijenite podatke ručke",
  emptyStateMessage: "Nema ručki u sistemu. Dodajte prvu ručku.",
  deleteConfirmMessage: "Jeste li sigurni da želite obrisati ovu ručku?",
  cacheTag: "rucke",
};

export async function CachedRuckeList() {
  cacheLife("hours");
  cacheTag("rucke");

  const rucke: RuckaWithMaterial[] = await RuckaService.getAll();

  const items = rucke.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    materialId: r.materialId,
    material: r.material,
  }));

  return (
    <CategoryItemsList
      items={items}
      config={ruckeConfig}
      createAction={createRucka}
      updateAction={updateRucka}
      deleteAction={deleteRucka}
    />
  );
}
