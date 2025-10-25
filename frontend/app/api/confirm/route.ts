import { NextResponse } from "next/server";
import { getStore } from "../_lib/store";

const store = getStore();

export async function POST(req: Request) {
  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "Missing incident id" }, { status: 400 });
  }

  const existing = store.get(id);

  if (!existing) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const updated = {
    ...existing,
    status: "done",
    confirmedAt: new Date().toISOString(),
  };

  store.set(id, updated);

  return NextResponse.json(updated);
}
