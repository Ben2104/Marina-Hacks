"use client";

import React, { useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface LocationPromptProps {
    useCurrentLocation: () => void;
    locating: boolean;
    locationError: string | null;
}

// --- UI helpers (shadcn-like primitives kept inline to avoid external deps during hackathon) ---

function Button({ className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 shadow-sm border border-neutral-200 hover:shadow transition active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export default function LocationPrompt({
    useCurrentLocation,
    locating,
    locationError,
}: LocationPromptProps) {
    const [locationPromptDismissed, setLocationPromptDismissed] = useState(false);

    if (locationPromptDismissed) return null;

    return (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm text-neutral-700">
                <MapPin className="w-4 h-4" /> Use your current location?
            </div>
            <div className="text-xs text-neutral-500">
                Center the map around your device location to speed up dispatch decisions.
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
                <Button className="bg-black text-white hover:opacity-90" onClick={useCurrentLocation} disabled={locating}>
                    {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Allow location
                </Button>
                <Button onClick={() => setLocationPromptDismissed(true)} className="bg-white text-black">
                    Not now
                </Button>
            </div>
            {locationError && <div className="text-xs text-red-600">{locationError}</div>}
        </div>
    );
}
