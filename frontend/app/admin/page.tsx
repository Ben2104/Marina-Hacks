"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Mic, Square, Upload, MapPin, Play, Pause, FileAudio2, Loader2, CheckCircle2, TriangleAlert, Search, ChevronRight, Trash2 } from "lucide-react";
import LocationPrompt from "../components/LocationPrompt";
import Recording from "../components/Recording";

/**
 * 911 Operator Dashboard — Single-file Next.js page
 * -------------------------------------------------
 * Put this file at: app/dashboard/page.tsx
 *
 * What it does:
 * - Left panel: record audio OR upload call recordings (mp3/wav/m4a)
 * - Sends audio to server: POST /api/calls (multipart/form-data)
 * - Polls job status: GET /api/calls/:id -> { status, transcript, emergencyType, confidence, location, callerPhone, flags }
 * - Right panel: Google Map shows markers returned by the server (auto or on operator confirmation)
 * - Operator can click a marker to open an action panel and send canned messages (stub: POST /api/dispatch)
 * - CPU-only mode: operator must click "Confirm & Mark" when enough info is present
 *
 * Expected minimal backend endpoints (you can stub for hackathon):
 *   POST /api/calls
 *     - formData: { file: Blob, filename?: string }
 *     - returns: { id: string }
 *
 *   GET /api/calls/[id]
 *     - returns while processing: { id, status: "processing" | "needs_confirmation" | "done", progress?: number }
 *     - returns when parsed:
 *         {
 *           id,
 *           status: "needs_confirmation" | "done",
 *           transcript: string,
 *           emergencyType: "Robbery" | "Fire" | "Medical" | "Accident" | "Unknown",
 *           confidence: number, // 0..1 for classification
 *           location: { lat: number, lng: number, address?: string } | null,
 *           callerPhone?: string,
 *           flags?: { brokenAccent?: boolean; intoxicated?: boolean; suspectedSwatting?: boolean }
 *         }
 *
 *   POST /api/confirm
 *     - body: { id }
 *     - server responds with confirmed parsed payload and persists marker
 *
 *   GET /api/incidents
 *     - returns: Array<Incident>
 *
 *   POST /api/dispatch
 *     - body: { incidentId, channel: "SMS" | "RADIO" | "INTERNAL", message: string }
 *     - returns: { ok: true }
 *
 * Google Maps:
 *   - Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in env.
 *
 * Notes:
 *   - This page is fully client-side. For production, gate with auth and CSRF.
 *   - MediaRecorder is supported in Chromium/Firefox/Safari (desktop). iOS may require user gesture.
 */

// --- Types ---

type Incident = {
  id: string;
  createdAt: string; // ISO
  transcript?: string;
  emergencyType?: string;
  confidence?: number; // 0..1
  location?: { lat: number; lng: number; address?: string } | null;
  callerPhone?: string;
  flags?: { brokenAccent?: boolean; intoxicated?: boolean; suspectedSwatting?: boolean };
  status: "processing" | "needs_confirmation" | "done";
};

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

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-neutral-200 shadow-sm bg-white ${className}`}>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold tracking-wide text-neutral-500 uppercase">{children}</div>;
}

// --- Page Component ---

export default function DashboardPage() {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [selectedUploadName, setSelectedUploadName] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cpuMode, setCpuMode] = useState(true); // true = operator must confirm before placing marker
  const [loadingMap, setLoadingMap] = useState(true);
  const [pendingCenter, setPendingCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [locationPromptDismissed, setLocationPromptDismissed] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualLatitude, setManualLatitude] = useState("");
  const [manualLongitude, setManualLongitude] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualLocationError, setManualLocationError] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [pendingManualId, setPendingManualId] = useState<string | null>(null);
  const [confirmingManual, setConfirmingManual] = useState(false);
  const [confirmManualError, setConfirmManualError] = useState<string | null>(null);
  const [selectedActionError, setSelectedActionError] = useState<string | null>(null);
  const [isConfirmingSelected, setIsConfirmingSelected] = useState(false);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  // Load Google Maps
  useEffect(() => {
    let cancelled = false;

    const initMap = async () => {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) {
        console.warn("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
      }
      try {
        setOptions({ key: key || "", v: "weekly" });
        await Promise.all([importLibrary("maps"), importLibrary("marker")]);
        if (cancelled || !mapRef.current) return;
        const m = new google.maps.Map(mapRef.current, {
          center: { lat: 37.7749, lng: -122.4194 },
          zoom: 11,
          mapId: "911-ops-map",
          disableDefaultUI: false,
        });
        setMap(m);
      } catch (error) {
        console.error("Failed to load Google Maps", error);
      } finally {
        if (!cancelled) setLoadingMap(false);
      }
    };

    initMap();

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch existing incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch("/api/incidents");
      if (!res.ok) return;
      const data: Incident[] = await res.json();
      setIncidents((prev) => {
        const manual = prev.filter(
          (inc) => inc.id.startsWith("manual-") && !data.some((remote) => remote.id === inc.id)
        );
        return [...manual, ...data];
      });
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const id = setInterval(fetchIncidents, 5000);
    return () => clearInterval(id);
  }, [fetchIncidents]);

  useEffect(() => {
    if (!selectedIncident) return;
    const latest = incidents.find((inc) => inc.id === selectedIncident.id);
    if (latest && latest !== selectedIncident) {
      setSelectedIncident(latest);
    }
  }, [incidents, selectedIncident]);

  // Render markers
  useEffect(() => {
    if (!map) return;
    if (pendingCenter) {
      map.panTo(pendingCenter);
      map.setZoom(13);
      setPendingCenter(null);
    }

    // Clear existing markers by attaching to map instance
    (map as any).__markers?.forEach((mk: google.maps.marker.AdvancedMarkerElement) => mk.map = null);
    (map as any).__markers = [];

    incidents.forEach((inc) => {
      if (!inc.location) return;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: inc.location,
        title: `${inc.emergencyType || "Incident"} (${(inc.confidence ?? 0) * 100 | 0}%)`,
      });
      marker.addListener("click", () => {
        focusIncidentLocation(inc);
        setSelectedIncident(inc);
      });
      (map as any).__markers.push(marker);
    });

    const latestWithLoc = [...incidents].reverse().find(i => i.location);
    if (latestWithLoc) {
      map.panTo(latestWithLoc.location as google.maps.LatLngLiteral);
    }
  }, [incidents, map]);

  const useCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError("Geolocation unsupported in this browser.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (map) {
          map.panTo(coords);
          map.setZoom(13);
        } else {
          setPendingCenter(coords);
        }
        setLocating(false);
        setLocationPromptDismissed(true);
      },
      (err) => {
        setLocating(false);
        setLocationError(err.message || "Failed to fetch location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const focusIncidentLocation = (incident: Incident) => {
    if (!incident.location) return;
    const coords = incident.location as google.maps.LatLngLiteral;
    if (map) {
      map.panTo(coords);
      map.setZoom(13);
    } else {
      setPendingCenter(coords);
    }
    setSelectedIncident(incident);
  };

  const handleManualLocationSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const hasCoords = manualLatitude.trim() !== "" && manualLongitude.trim() !== "";
    const hasAddress = manualAddress.trim() !== "";
    if (!hasCoords && !hasAddress) {
      setManualLocationError("Enter coordinates or an address to center the map.");
      return;
    }

    setManualLocationError(null);
    setIsGeocoding(true);

    try {
      let coords: google.maps.LatLngLiteral | null = null;
      let resolvedAddress = manualAddress.trim();

      if (hasCoords) {
        const lat = Number(manualLatitude);
        const lng = Number(manualLongitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          throw new Error("Latitude and longitude must be valid numbers.");
        }
        coords = { lat, lng };
      } else if (hasAddress) {
        if (typeof google === "undefined" || !google.maps?.Geocoder) {
          throw new Error("Maps API not ready. Please wait a moment and try again.");
        }
        const geocoder = new google.maps.Geocoder();
        const geocodeResult = await geocoder.geocode({ address: resolvedAddress });
        if (!geocodeResult.results?.length) {
          throw new Error("No results for that address.");
        }
        const best = geocodeResult.results[0];
        coords = best.geometry.location?.toJSON();
        resolvedAddress = best.formatted_address || resolvedAddress;
      }

      if (!coords) {
        throw new Error("Unable to resolve coordinates.");
      }

      if (map) {
        map.panTo(coords);
        map.setZoom(13);
      } else {
        setPendingCenter(coords);
      }

      const manualEntry: Incident = {
        id: `manual-${Date.now()}`,
        createdAt: new Date().toISOString(),
        emergencyType: "Manual",
        confidence: undefined,
        transcript: resolvedAddress ? `Operator note: ${resolvedAddress}` : undefined,
        location: { lat: coords.lat, lng: coords.lng, address: resolvedAddress || undefined },
        status: "needs_confirmation",
      };
      setIncidents((prev) => [manualEntry, ...prev]);
      setPendingManualId(manualEntry.id);
      setConfirmManualError(null);
      setManualLatitude("");
      setManualLongitude("");
      setManualAddress("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to center on that location.";
      setManualLocationError(message);
    } finally {
      setIsGeocoding(false);
    }
  };

  // Media recorder handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        setAudioChunks(chunks);
      };
      mediaRecorder.start();
      setRecorder(mediaRecorder);
      setIsRecording(true);
    } catch (e) {
      alert("Microphone access failed. Check permissions.");
      console.error(e);
    }
  };

  const stopRecording = () => {
    if (!recorder) return;
    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  };

  // Upload with progress reporting (uses XHR to provide upload progress)
  const uploadBlob = (blob: Blob, filename = `call-${Date.now()}.webm`) => {
    return new Promise<{ id: string }>((resolve, reject) => {
      setUploadError(null);
      setSelectedUploadName(filename);
      setUploadProgress(0);

      const form = new FormData();
      form.append("file", blob, filename);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/calls");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const p = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(p);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            const id = data.id as string;
            setUploadingId(id);
            setUploadProgress(null);
            setSelectedUploadName(null);
            pollJob(id);
            resolve({ id });
          } catch (err) {
            setUploadError("Invalid server response");
            setUploadProgress(null);
            reject(err);
          }
        } else {
          setUploadError(`Upload failed (${xhr.status})`);
          setUploadProgress(null);
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        setUploadError("Network error during upload");
        setUploadProgress(null);
        reject(new Error("Network error"));
      };

      xhr.send(form);
    });
  };

  const handleUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadBlob(file, file.name);
  };

  const submitRecording = async () => {
    if (!audioChunks.length) return;
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    await uploadBlob(blob);
    setAudioChunks([]);
  };

  // Poll server for processing result
  const pollJob = async (id: string) => {
    let attempts = 0;
    const maxAttempts = 120; // 10 min @ 5s
    const interval = 5000;
    const timer = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/calls/${id}`);
        if (!res.ok) return;
        const data: Incident = await res.json();
        // Merge into incidents list
        setIncidents((prev) => {
          const idx = prev.findIndex((p) => p.id === data.id);
          const next = [...prev];
          if (idx >= 0) next[idx] = { ...next[idx], ...data };
          else next.unshift(data);
          return next;
        });
        if (data.status === "needs_confirmation" && cpuMode) {
          // Wait for operator confirmation
        } else if (data.status === "done" && data.location) {
          setUploadingId(null);
          clearInterval(timer);
        }
      } catch (e) {
        console.error(e);
      }
      if (attempts >= maxAttempts) clearInterval(timer);
    }, interval);
  };

  const confirmIncident = async (id: string): Promise<Incident | null> => {
    try {
      const res = await fetch(`/api/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Confirmation failed");
      const data: Incident = await res.json();
      setIncidents((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
      if (pendingManualId === id) {
        setPendingManualId(null);
      }
      setSelectedIncident((current) => (current && current.id === id ? { ...current, ...data } : current));
      return data;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const quickPins = useMemo(() => incidents.filter((inc) => inc.location).slice(0, 3), [incidents]);
  const pendingManualIncident = useMemo(
    () => (pendingManualId ? incidents.find((inc) => inc.id === pendingManualId) || null : null),
    [incidents, pendingManualId]
  );

  const handleConfirmPendingManual = async () => {
    if (!pendingManualIncident) return;
    setConfirmingManual(true);
    setConfirmManualError(null);
    const result = await confirmIncident(pendingManualIncident.id);
    if (result) {
      setPendingManualId(null);
    } else {
    setConfirmManualError("Unable to confirm marker. Try again.");
    }
    setConfirmingManual(false);
  };

  const extractPostalCode = (address?: string | null) => {
    if (!address) return null;
    const match = address.match(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b\d{5}(?:-\d{4})?\b/i);
    return match ? match[0] : null;
  };
  const handleKeepSelected = () => {
    if (!selectedIncident) return;
    setIncidents((prev) => prev.map((p) => (p.id === selectedIncident.id ? { ...p, confirmedAt: null } : p)));
    setSelectedIncident(null);
  };

  const handleDeleteSelected = () => {
    if (!selectedIncident) return;
    setIsDeletingSelected(true);
    setSelectedActionError(null);
    setIncidents((prev) => prev.filter((inc) => inc.id !== selectedIncident.id));
    if (pendingManualId === selectedIncident.id) {
      setPendingManualId(null);
    }
    setTimeout(() => {
      setIsDeletingSelected(false);
      setSelectedIncident(null);
    }, 200);
  };

  return (
    <div className="h-[calc(100vh-2rem)] w-full p-4 grid grid-cols-1 lg:grid-cols-[30%_70%] gap-4">
      {/* Left: Controls */}
      <Card className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-neutral-500" />
            <h1 className="text-xl text-black font-semibold">911 Operator Dashboard</h1>
          </div>
        </div>

        <LocationPrompt
          useCurrentLocation={useCurrentLocation}
          locating={locating}
          locationError={locationError}
        />

        {/* Upload */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4">
            <SectionTitle>Upload Call Recording</SectionTitle>
            <div className="mt-3 flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleUploadInput}
                />
                <span className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 shadow-sm border border-neutral-200 hover:shadow transition active:translate-y-[1px] bg-black text-white hover:opacity-90">
                  <Upload className="w-4 h-4" /> Choose file
                </span>
              </label>
              {uploadingId && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing #{uploadingId}
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Supported: .mp3, .wav, .m4a, .webm</p>
          </Card>

          {/* Recorder */}
          <Card className="p-4">
            <SectionTitle>Record Live Call</SectionTitle>
            <div className="mt-3 flex items-center gap-3">
              {!isRecording ? (
                <Button className="bg-black text-white hover:opacity-90" onClick={startRecording}>
                  <Mic className="w-4 h-4" /> Start
                </Button>
              ) : (
                <Button className="bg-red-600 text-white hover:opacity-90" onClick={stopRecording}>
                  <Square className="w-4 h-4" /> Stop
                </Button>
              )}
                <Button 
                onClick={submitRecording} 
                disabled={!audioChunks.length}
                className="bg-white text-black hover:opacity-90"
                >
                <FileAudio2 className="w-4 h-4" /> Submit recording
                </Button>
            </div>
            <p className="mt-2 text-xs text-neutral-500">Record, then submit for transcription + analysis.</p>
          </Card>
        </div>

        {/* Calls list */}
        <div>
          <SectionTitle>Recent Calls</SectionTitle>
          <div className="mt-3 flex flex-col gap-3 max-h-72 overflow-auto pr-2">
            {incidents.length === 0 && (
              <div className="text-sm text-neutral-500">No calls yet.</div>
            )}
            {incidents.map((inc) => (
              <Card key={inc.id} className="p-3 relative">
                {/* Status badge in top-right corner */}
                <div className="absolute top-3 right-3">
                  {inc.status === "processing" && (
                    <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" /> Processing
                    </span>
                  )}
                  {inc.status === "needs_confirmation" && (
                    <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full text-xs">
                      <TriangleAlert className="w-3 h-3" /> Needs confirmation
                    </span>
                  )}
                  {inc.status === "done" && (
                    <span className="inline-flex items-center gap-1 text-green-700 bg-green-100 px-2 py-0.5 rounded-full text-xs">
                      <CheckCircle2 className="w-3 h-3" /> Parsed
                    </span>
                  )}
                </div>

                {/* Card content */}
                <div className="pr-32">
                  <div className="flex items-center gap-2 text-sm mb-2">
                    <span className="font-semibold text-black">#{inc.id}</span>
                    <span className="text-neutral-500">{new Date(inc.createdAt || Date.now()).toLocaleString()}</span>
                  </div>
                  
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="text-neutral-500">Type:</span> <span className="text-black">{inc.emergencyType || "Unknown"}</span>
                      {typeof inc.confidence === "number" && (
                        <span className="ml-2 text-black">({Math.round((inc.confidence || 0) * 100)}%)</span>
                      )}
                    </div>
                    <div className="truncate">
                      <span className="text-neutral-500">Transcript:</span> <span className="text-black">{inc.transcript || "—"}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Location:</span>{" "}
                      {inc.location ? (
                        <span className="text-black">{inc.location.address || `${inc.location.lat.toFixed(5)}, ${inc.location.lng.toFixed(5)}`}</span>
                      ) : (
                        <span className="text-black">—</span>
                      )}
                    </div>
                    {inc.flags && (
                      <div className="text-xs text-neutral-600 mt-1">
                        {inc.flags.brokenAccent && <span className="mr-2">• Possible accent</span>}
                        {inc.flags.intoxicated && <span className="mr-2">• Possible intoxication</span>}
                        {inc.flags.suspectedSwatting && <span className="mr-2">• Possible fake call</span>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons at bottom */}
                <div className="mt-3 flex gap-2">
                  <Button 
                    className="flex-1 justify-center text-black" 
                    onClick={() => { focusIncidentLocation(inc); setSelectedIncident(inc); }}
                  >
                    <MapPin className="w-4 h-4" /> View on map
                  </Button>
                  {cpuMode && inc.status === "needs_confirmation" && (
                    <Button 
                      className="flex-1 justify-center bg-black text-white" 
                      onClick={() => confirmIncident(inc.id)}
                    >
                      Confirm & Mark
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Card>

      {/* Right: Map & Inspector */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0" ref={mapRef} />
        {loadingMap && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}
        <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-3 w-full max-w-sm">
          <div className="rounded-3xl bg-white border border-neutral-200 shadow-xl p-4 pointer-events-auto">
            <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Manual address</div>
            <form className="mt-3 flex flex-col gap-3 text-black" onSubmit={handleManualLocationSubmit}>
              <label className="text-xs font-medium text-black">Address or notes</label>
                <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2">
                <Search className="w-4 h-4 text-black" />
                <input
                  type="text"
                  placeholder="123 Main St, Long Beach"
                  value={manualAddress}
                  onChange={(e) => setManualAddress(e.target.value)}
                  className="flex-1 text-sm focus:outline-none placeholder:text-neutral-400"
                />
                </div>
              {manualLocationError && <div className="text-xs text-red-600">{manualLocationError}</div>}
              <div className="flex gap-2">
                <Button className="bg-black text-white hover:opacity-90 flex-1 justify-center" type="submit" disabled={isGeocoding}>
                  {isGeocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Apply
                </Button>
                <Button
                  type="button"
                  className="flex-1 justify-center"
                  onClick={() => {
                    setManualLatitude("");
                    setManualLongitude("");
                    setManualAddress("");
                    setManualLocationError(null);
                    setIsGeocoding(false);
                  }}
                >
                  Clear
                </Button>
              </div>
            </form>
          </div>

          {pendingManualIncident && (
            <div className="rounded-3xl bg-white border border-amber-200 shadow-xl p-4 pointer-events-auto">
              <div className="text-sm font-semibold text-amber-900">Confirm new marker</div>
              <p className="mt-1 text-xs text-neutral-600">Finalize the manual location you just added before it appears for other operators.</p>
              <div className="mt-2 rounded-2xl border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm">
                <div className="font-medium text-neutral-800">{pendingManualIncident.location?.address || "Manual coordinates"}</div>
                <div className="text-xs text-neutral-500">
                  {pendingManualIncident.location
                    ? `${pendingManualIncident.location.lat.toFixed(4)}, ${pendingManualIncident.location.lng.toFixed(4)}`
                    : "No coordinates"}
                </div>
              </div>
              {confirmManualError && <div className="mt-2 text-xs text-red-600">{confirmManualError}</div>}
              <div className="mt-3 flex gap-2">
                <Button
                  className="bg-black text-white hover:opacity-90 flex-1 justify-center"
                  type="button"
                  onClick={handleConfirmPendingManual}
                  disabled={confirmingManual}
                >
                  {confirmingManual ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm marker"}
                </Button>
                <Button
                  type="button"
                  className="flex-1 justify-center"
                  onClick={() => {
                    setPendingManualId(null);
                    setConfirmManualError(null);
                  }}
                >
                  Later
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-3xl bg-white border border-neutral-200 shadow-xl p-4 pointer-events-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-black">Recent pins</div>
              <span className="text-xs text-neutral-500">Tap to focus</span>
            </div>
            <div className="mt-3 space-y-2">
              {quickPins.length === 0 && <div className="text-xs text-neutral-500">Add a manual location to build quick pins.</div>}
              {quickPins.map((pin) => (
                <button
                  key={pin.id}
                  type="button"
                  className="w-full text-left flex items-center gap-3 rounded-2xl border border-neutral-100 hover:bg-neutral-50 px-3 py-2 transition"
                  onClick={() => focusIncidentLocation(pin)}
                >
                  <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-neutral-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-black">
                      {pin.location?.address || `${pin.location?.lat.toFixed(4)}, ${pin.location?.lng.toFixed(4)}`}
                    </div>
                    <div className="text-xs text-black truncate">{pin.emergencyType || "Manual entry"}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </button>
              ))}
            </div>
          </div>
        </div>
        {selectedIncident && (
          <div className="pointer-events-none absolute top-4 right-4 w-full max-w-sm">
            <div className="pointer-events-auto rounded-3xl bg-white border border-neutral-200 shadow-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">Marker details</div>
                  <div className="text-lg font-semibold text-neutral-900">#{selectedIncident.id}</div>
                </div>
                <Button className="text-sm text-black" onClick={() => setSelectedIncident(null)}>
                  Close
                </Button>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div>
                    <span className="text-neutral-500">Address:</span> <span className="text-black">{selectedIncident.location?.address || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Postal code:</span> <span className="text-black">{extractPostalCode(selectedIncident.location?.address) || "—"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Coordinates:</span>{" "} <span className="text-black">
                  {selectedIncident.location
                    ? `${selectedIncident.location.lat.toFixed(5)}, ${selectedIncident.location.lng.toFixed(5)}`
                    : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Status:</span> <span className="text-black">{selectedIncident.status}</span>
                </div>
                {selectedIncident.transcript && (
                  <div>
                    <span className="text-neutral-500">Notes:</span> <span className="text-black">{selectedIncident.transcript}</span>
                  </div>
                )}
              </div>
              {selectedActionError && <div className="mt-2 text-xs text-red-600">{selectedActionError}</div>}
              <div className="mt-4 flex flex-col gap-2">
              
                <Button
                  className="justify-center bg-black text-white hover:opacity-90"
                  type="button"
                  onClick={handleKeepSelected}
                  disabled={isConfirmingSelected || isDeletingSelected}
                >
                  Keep marker
                </Button>
                <Button
                  className="justify-center border-red-200 text-red-700"
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isDeletingSelected}
                >
                  {isDeletingSelected ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4" /> Delete marker
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Backend sketch (TypeScript) — OPTIONAL, for reference
 * -----------------------------------------------------
 *
 * // app/api/calls/route.ts
 * export const POST = async (req: Request) => {
 *   const form = await req.formData();
 *   const file = form.get("file") as File;
 *   // 1) Store to /tmp or object storage; enqueue background job
 *   // 2) Return job id
 *   const id = crypto.randomUUID();
 *   // enqueueJob({ id, filePath, cpuOnly: true/false })
 *   return Response.json({ id });
 * };
 *
 * // app/api/calls/[id]/route.ts
 * export const GET = async (_req: Request, { params }: { params: { id: string } }) => {
 *   // lookup job status/result in your DB/redis
 *   const row = await db.calls.find(params.id);
 *   return Response.json(row);
 * };
 *
 * // app/api/confirm/route.ts
 * export const POST = async (req: Request) => {
 *   const { id } = await req.json();
 *   // Mark as confirmed, finalize location/marker
 *   const row = await confirmCall(id);
 *   return Response.json(row);
 * };
 *
 * // app/api/incidents/route.ts
 * export const GET = async () => {
 *   const rows = await db.listIncidents();
 *   return Response.json(rows);
 * };
 *
 * // app/api/dispatch/route.ts
 * export const POST = async (req: Request) => {
 *   const { incidentId, channel, message } = await req.json();
 *   // Integrate Twilio / radio / internal messaging
 *   await send({ incidentId, channel, message });
 *   return Response.json({ ok: true });
 * };
 *
 *\*/
