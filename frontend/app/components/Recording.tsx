
import { Upload, Loader2 } from "lucide-react";

interface UploadProps {
    uploadingId: string | null;
    handleUploadInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-neutral-200 shadow-sm bg-white ${className}`}>{children}</div>;
}
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
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="font-semibold">{children}</h3>
);

export default function Recording({ uploadingId, handleUploadInput }: UploadProps) {
    return (
        <Card className="p-4">
            <SectionTitle>Upload Call Recording</SectionTitle>
            <div className="mt-3 flex items-center gap-3">
                <label className="relative inline-flex items-center">
                    <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleUploadInput}
                    />
                    <Button className="bg-black text-white hover:opacity-90">
                        <Upload className="w-4 h-4" /> Choose file
                    </Button>
                </label>
                {uploadingId && (
                    <div className="flex items-center gap-2 text-sm text-neutral-600">
                        <Loader2 className="w-4 h-4 animate-spin" /> Processing #{uploadingId}
                    </div>
                )}
            </div>
            <p className="mt-2 text-xs text-neutral-500">Supported: .mp3, .wav, .m4a, .webm</p>
        </Card>
    );
}