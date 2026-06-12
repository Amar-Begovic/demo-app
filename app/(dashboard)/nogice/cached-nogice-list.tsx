"use cache";

import { cacheLife, cacheTag } from "next/cache";
import { NogicaService } from "@/lib/services/nogica.service";
import type { NogicaWithMaterial } from "@/lib/services/nogica.service";
import { CategoryItemsList } from "../components/category-items-list";
import type { CategoryConfig } from "@/lib/types/category-config";
import { createNogica, updateNogica, deleteNogica } from "@/app/actions/nogice";

const nogiceConfig: CategoryConfig = {
  slug: "nogice",
  title: "Nogice",
  subtitle: "Upravljanje nogicama za proizvodnju",
  createButtonLabel: "Nova nogica",
  createDialogTitle: "Dodaj novu nogicu",
  createDialogDescription: "Unesite podatke za novu nogicu",
  editDialogTitle: "Uredi nogicu",
  editDialogDescription: "Izmijenite podatke nogice",
  emptyStateMessage: "Nema nogica u sistemu. Dodajte prvu nogicu.",
  deleteConfirmMessage: "Jeste li sigurni da želite obrisati ovu nogicu?",
  cacheTag: "nogice",
};

export async function CachedNogiceList() {
  cacheLife("hours");
  cacheTag("nogice");

  const nogice: NogicaWithMaterial[] = await NogicaService.getAll();

  const items = nogice.map((n) => ({
    id: n.id,
    name: n.name,
    code: n.code,
    description: n.description,
    materialId: n.materialId,
    material: n.material,
  }));

  return (
    <CategoryItemsList
      items={items}
      config={nogiceConfig}
      createAction={createNogica}
      updateAction={updateNogica}
      deleteAction={deleteNogica}
    />
  );
}
