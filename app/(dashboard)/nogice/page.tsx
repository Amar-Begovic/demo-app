import { Suspense } from "react";
import { CachedNogiceList } from "./cached-nogice-list";
import NogiceLoading from "./loading";

export default async function NogicePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nogice</h1>
          <p className="text-muted-foreground">
            Upravljanje nogicama za proizvodnju
          </p>
        </div>
      </div>

      <Suspense fallback={<NogiceLoading />}>
        <CachedNogiceList />
      </Suspense>
    </div>
  );
}
