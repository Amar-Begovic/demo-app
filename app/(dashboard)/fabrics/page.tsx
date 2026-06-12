import { CreateFabricDialog } from "./components/create-fabric-dialog";
import { FabricExcelToolbar } from "./components/fabric-excel-toolbar";
import { CachedFabricsList } from "./cached-fabrics-list";

export default async function FabricsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stofovi</h1>
          <p className="text-muted-foreground">
            Upravljanje stofovima za proizvodnju
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FabricExcelToolbar />
          <CreateFabricDialog />
        </div>
      </div>

      <CachedFabricsList />
    </div>
  );
}
