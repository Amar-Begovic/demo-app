import { NextRequest, NextResponse } from "next/server";
import { BarcodeService } from "@/lib/services/barcode.service";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ value: string }> }
) {
  try {
    const { value } = await params;

    // Find barcode by value to get its ID
    const barcode = await prisma.barcode.findUnique({ where: { value } });
    if (!barcode) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Barcode "${value}" not found` },
        { status: 404 }
      );
    }

    const pngBuffer = await BarcodeService.generateLabel(barcode.id);

    return new NextResponse(new Uint8Array(pngBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename="label-${value}.png"`,
      },
    });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("does not exist") || message.includes("not found")) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
