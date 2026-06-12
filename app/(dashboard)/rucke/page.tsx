import { Suspense } from "react";
import { CachedRuckeList } from "./cached-rucke-list";
import RuckeLoading from "./loading";

export default async function RuckePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ručke</h1>
          <p className="text-muted-foreground">
            Upravljanje ručkama za proizvodnju
          </p>
        </div>
      </div>

      <Suspense fallback={<RuckeLoading />}>
        <CachedRuckeList />
      </Suspense>
    </div>
  );
}
