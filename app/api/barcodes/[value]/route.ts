import { NextRequest, NextResponse } from "next/server";
import { BarcodeService } from "@/lib/services/barcode.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ value: string }> }
) {
  try {
    const { value } = await params;
    const info = await BarcodeService.lookup(value);
    return NextResponse.json(info);
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("not found")) {
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
