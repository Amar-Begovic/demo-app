import { NextResponse } from "next/server";
import { FabricService } from "@/lib/services/fabric.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const fabric = await FabricService.getById(id);
    if (!fabric) {
      return NextResponse.json({ error: "Stof nije pronađen" }, { status: 404 });
    }
    return NextResponse.json(fabric);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Greška" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const fabric = await FabricService.update(id, body);
    return NextResponse.json(fabric);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Greška pri ažuriranju" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await FabricService.delete(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Greška pri brisanju" },
      { status: 400 }
    );
  }
}
