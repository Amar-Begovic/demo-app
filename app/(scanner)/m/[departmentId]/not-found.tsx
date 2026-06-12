import { AlertTriangle } from "lucide-react";

export default function DepartmentNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
        <h1 className="mt-4 text-xl font-semibold">Odjel nije pronađen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Traženi odjel ne postoji. Provjerite URL i pokušajte ponovo.
        </p>
      </div>
    </div>
  );
}
