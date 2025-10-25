import { NextResponse } from "next/server";

type IncidentPayload = {
  id: string;
  status: "done";
  confirmedAt: string;
  notes?: string;
};

export async function POST(req: Request) {
  const { id } = await req.json();

  if (!id) {
    return NextResponse.json(
      { error: "Missing incident id" },
      { status: 400 }
    );
  }

  const payload: IncidentPayload = {
    id,
    status: "done",
    confirmedAt: new Date().toISOString(),
    notes: "Stub confirmation payload",
  };

  return NextResponse.json(payload);
}
