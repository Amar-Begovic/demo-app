import { NextResponse } from "next/server";
import { FabricService } from "@/lib/services/fabric.service";

export async function GET() {
  try {
    const fabrics = await FabricService.getAll();
    return NextResponse.json(fabrics);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Greška pri dohvatanju stofova" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const fabric = await FabricService.create(body);
    return NextResponse.json(fabric, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Greška pri kreiranju stofa" },
      { status: 400 }
    );
  }
}
