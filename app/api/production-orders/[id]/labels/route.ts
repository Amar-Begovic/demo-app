import { NextRequest, NextResponse } from "next/server";
import { BarcodeService } from "@/lib/services/barcode.service";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify the production order exists
    const order = await prisma.productionOrder.findUnique({
      where: { id },
    });
    if (!order) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Production order "${id}" not found` },
        { status: 404 }
      );
    }

    const labels = await BarcodeService.generatePartIdentifierLabels(id);
    return NextResponse.json(labels);
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
