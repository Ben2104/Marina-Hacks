import { Buffer } from "buffer";
import { NextResponse } from "next/server";
import { getStore } from "../_lib/store";

const LOCATION_ENDPOINT = process.env.LOCATION_API_URL ?? "http://127.0.0.1:8000/location";
const store = getStore();

async function processLocationJob(id: string, buffer: Buffer, filename: string, mimeType: string) {
  try {
    const forwardForm = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType || "application/octet-stream" });
    forwardForm.append("file", blob, filename || "call.webm");

    const response = await fetch(LOCATION_ENDPOINT, {
      method: "POST",
      body: forwardForm,
    });

    if (!response.ok) {
      throw new Error(`Location API responded with ${response.status}`);
    }

    const payload = await response.json();
    console.log("Location job payload:", payload);
    const location =
      typeof payload?.latitude === "number" && typeof payload?.longitude === "number"
        ? {
            lat: payload.latitude,
            lng: payload.longitude,
            address: payload.address || payload.location || undefined,
          }
        : null;

    store.set(id, {
      ...(store.get(id) || { id, createdAt: new Date().toISOString() }),
      id,
      status: "done",
      createdAt: store.get(id)?.createdAt || new Date().toISOString(),
      emergencyType: payload?.type_of_emergency || "Unknown",
      transcript: payload?.transcript || store.get(id)?.transcript,
      location,
      notes: payload?.location,
    });
  } catch (error) {
    console.error("Location job failed", error);
    store.set(id, {
      ...(store.get(id) || { id, createdAt: new Date().toISOString() }),
      status: "needs_confirmation",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export const POST = async (req: Request) => {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const filename = typeof (file as any).name === "string" && (file as any).name.length > 0 ? (file as any).name : "call.webm";
    const mimeType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    const id = `job-${Date.now()}`;
    const createdAt = new Date().toISOString();

    store.set(id, { id, status: "processing", createdAt });

    // Process in the background so the upload returns immediately
    processLocationJob(id, buffer, filename, mimeType);

    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
};
