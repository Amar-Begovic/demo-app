import { Suspense } from "react";
import { CachedPaspulList } from "./cached-paspul-list";
import PaspulLoading from "./loading";

export default async function PaspulPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paspul</h1>
          <p className="text-muted-foreground">
            Upravljanje paspul trakama za proizvodnju
          </p>
        </div>
      </div>

      <Suspense fallback={<PaspulLoading />}>
        <CachedPaspulList />
      </Suspense>
    </div>
  );
}
