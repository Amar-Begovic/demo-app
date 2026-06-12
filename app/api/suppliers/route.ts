import { NextRequest, NextResponse } from "next/server";
import { SupplierService } from "@/lib/services/supplier.service";

export async function GET() {
  try {
    const suppliers = await SupplierService.getAll();
    return NextResponse.json(suppliers);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const errors: Record<string, string[]> = {};
    if (!body.companyName || typeof body.companyName !== "string" || body.companyName.trim() === "") {
      errors.companyName = ["Company name is required"];
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Invalid input", details: errors },
        { status: 400 }
      );
    }

    const supplier = await SupplierService.create({
      companyName: body.companyName.trim(),
      code: body.code,
      type: body.type,
      vatStatus: body.vatStatus,
      vatNumber: body.vatNumber,
      registration: body.registration,
      country: body.country,
      city: body.city,
      postalCode: body.postalCode,
      address: body.address,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      materialIds: body.materialIds,
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("not found")) {
      return NextResponse.json(
        { status: 422, code: "BUSINESS_LOGIC_ERROR", message },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
