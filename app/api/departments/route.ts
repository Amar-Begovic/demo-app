import { NextRequest, NextResponse } from "next/server";
import { DepartmentService } from "@/lib/services/department.service";

export async function GET() {
  try {
    const departments = await DepartmentService.getAll();
    return NextResponse.json(departments);
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
    if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
      errors.name = ["Name is required"];
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { status: 400, code: "VALIDATION_ERROR", message: "Invalid input", details: errors },
        { status: 400 }
      );
    }

    const department = await DepartmentService.create({
      name: body.name.trim(),
      description: body.description,
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { status: 500, code: "INTERNAL_ERROR", message: (error as Error).message },
      { status: 500 }
    );
  }
}
