import { NextResponse } from "next/server";

// Simple in-memory job store for local development only
if (!(global as any).__CALLS_STORE) {
  (global as any).__CALLS_STORE = new Map();
}
const store = (global as any).__CALLS_STORE;

export const POST = async (req: Request) => {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const id = `job-${Date.now()}`;

    // Seed job as processing
    store.set(id, { id, status: "processing", createdAt: new Date().toISOString() });

    // Simulate background processing and mark done after a short delay
    setTimeout(() => {
      store.set(id, {
        id,
        status: "done",
        createdAt: new Date().toISOString(),
        transcript: "(simulated) transcribed audio",
        emergencyType: "Unknown",
        confidence: 0.6,
        location: { lat: 37.7749, lng: -122.4194, address: "San Francisco, CA" },
      });
    }, 2500);

    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
};
