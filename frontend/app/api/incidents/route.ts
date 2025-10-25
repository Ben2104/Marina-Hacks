import { NextResponse } from "next/server";
import { getStore } from "../_lib/store";

const store = getStore();

export async function GET(_request: Request) {
  return NextResponse.json(Array.from(store.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  }));
}
