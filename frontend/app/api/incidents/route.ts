// frontend/app/api/incidents/route.ts
import { NextResponse } from "next/server";

const incidents = [
  { id: "abc123", createdAt: new Date().toISOString(), status: "done" },
  // ...c
];

export async function GET(_request: Request) {
  return NextResponse.json(incidents);
}
