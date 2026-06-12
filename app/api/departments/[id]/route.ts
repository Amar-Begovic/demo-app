import { NextRequest, NextResponse } from "next/server";
import { DepartmentService } from "@/lib/services/department.service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const department = await DepartmentService.getById(id);

    if (!department) {
      return NextResponse.json(
        { status: 404, code: "NOT_FOUND", message: `Department with id "${id}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(department);
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
