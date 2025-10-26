import { NextResponse } from "next/server";
import { getStore } from "../../_lib/store";

const store = getStore();

export const GET = async (_req: Request, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const entry = store.get(id);
  if (!entry) {
    return NextResponse.json({ id, status: "processing" });
  }
  return NextResponse.json(entry);
};
