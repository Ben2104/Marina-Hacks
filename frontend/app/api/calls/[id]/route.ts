import { NextResponse } from "next/server";

const store = (global as any).__CALLS_STORE || new Map();

export const GET = async (_req: Request, { params }: { params: { id: string } }) => {
  const { id } = params;
  const entry = store.get(id);
  if (!entry) {
    return NextResponse.json({ id, status: "processing" });
  }
  return NextResponse.json(entry);
};
