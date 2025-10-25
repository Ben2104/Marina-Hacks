export type IncidentRecord = {
  id: string;
  status: "processing" | "needs_confirmation" | "done";
  createdAt: string;
  transcript?: string;
  emergencyType?: string;
  confidence?: number;
  location?: { lat: number; lng: number; address?: string } | null;
  callerPhone?: string;
  flags?: { brokenAccent?: boolean; intoxicated?: boolean; suspectedSwatting?: boolean };
  confirmedAt?: string | null;
  notes?: string;
  error?: string;
};

type GlobalWithStore = typeof globalThis & {
  __CALLS_STORE?: Map<string, IncidentRecord>;
};

export function getStore() {
  const globalWithStore = globalThis as GlobalWithStore;
  if (!globalWithStore.__CALLS_STORE) {
    globalWithStore.__CALLS_STORE = new Map();
  }
  return globalWithStore.__CALLS_STORE;
}
