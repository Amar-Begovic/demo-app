import { NextRequest, NextResponse } from "next/server";
import { SupplierService } from "@/lib/services/supplier.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supplier = await SupplierService.getById(id);

    if (!supplier) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Supplier with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(supplier);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
