import { Skeleton } from "@/components/ui/skeleton";

export default function ArticlesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-64 mt-1" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="rounded-md border">
        <div className="border-b">
          <div className="flex items-center h-12 px-4 gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center h-14 px-4 gap-4 border-b last:border-b-0">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
