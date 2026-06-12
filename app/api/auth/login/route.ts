import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE = "ProTrack-session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { message: "ADMIN_PASSWORD nije konfigurisan" },
        { status: 500 }
      );
    }

    if (password !== adminPassword) {
      return NextResponse.json(
        { message: "Pogrešna lozinka" },
        { status: 401 }
      );
    }

    const token = generateSessionToken();
    const cookieStore = await cookies();

    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE,
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { message: "Greška pri prijavi" },
      { status: 500 }
    );
  }
}
