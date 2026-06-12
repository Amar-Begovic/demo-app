import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DepartmentService } from "@/lib/services/department.service";
import MobileScannerClient from "./mobile-scanner-client";

interface PageProps {
  params: Promise<{ departmentId: string }>;
}

async function ScannerLoader({ params }: { params: Promise<{ departmentId: string }> }) {
  const { departmentId } = await params;
  const department = await DepartmentService.getById(departmentId);

  if (!department) {
    notFound();
  }

  return (
    <MobileScannerClient
      departmentId={department.id}
      departmentName={department.name}
    />
  );
}

export default async function DepartmentScanPage({ params }: PageProps) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-dvh text-muted-foreground">Učitavanje...</div>}>
      <ScannerLoader params={params} />
    </Suspense>
  );
}
