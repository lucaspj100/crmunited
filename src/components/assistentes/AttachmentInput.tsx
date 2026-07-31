import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Upload, X, FileText, Loader2, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { fileToDataUrl, formatBytes, validateFile, type AttachmentPayload } from "@/lib/ai-assistants";

type Props = {
  attachments: AttachmentPayload[];
  onChange: (next: AttachmentPayload[]) => void;
  max?: number;
};

export function AttachmentInput({ attachments, onChange, max = 4 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const addFiles = useCallback(
    async (files: File[], fromPaste = false) => {
      if (!files.length) return;
      const room = max - attachments.length;
      if (room <= 0) {
        toast.error(`Máximo de ${max} arquivos por geração.`);
        return;
      }
      setBusy(true);
      const next: AttachmentPayload[] = [];
      for (const file of files.slice(0, room)) {
        const problem = validateFile(file);
        if (problem) {
          toast.error(`${file.name}: ${problem}`);
          continue;
        }
        try {
          const dataUrl = await fileToDataUrl(file);
          next.push({
            name: file.name || (fromPaste ? "print-colado.png" : "arquivo"),
            mime: file.type || "application/octet-stream",
            size: file.size,
            dataUrl,
          });
        } catch {
          toast.error(`Falha ao carregar ${file.name}.`);
        }
      }
      setBusy(false);
      if (next.length) {
        onChange([...attachments, ...next]);
        toast.success(fromPaste ? "Print colado com sucesso" : "Arquivo adicionado.");
      }
    },
    [attachments, max, onChange],
  );

  // Ctrl + V em qualquer lugar do assistente (sem quebrar a digitação em outros campos).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const images = items.filter((i) => i.kind === "file" && i.type.startsWith("image/"));
      if (!images.length) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag && tag !== "textarea" && tag !== "body" && tag !== "div" && tag !== "input") return;
      if (tag === "input" && (target as HTMLInputElement).type !== "text") return;
      const files = images.map((i) => i.getAsFile()).filter((f): f is File => !!f);
      if (!files.length) return;
      e.preventDefault();
      void addFiles(files, true);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-xs transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/60"
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="font-medium">Cole um print com Ctrl + V, arraste um arquivo ou clique para selecionar.</span>
        <span className="text-muted-foreground">PNG, JPG, WEBP, PDF ou TXT — imagens até 10 MB.</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
        className="hidden"
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {attachments.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {attachments.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-card p-2">
              {a.mime.startsWith("image/") ? (
                <button type="button" className="relative shrink-0" onClick={() => setZoom(a.dataUrl)} title="Ampliar">
                  <img src={a.dataUrl} alt={a.name} className="h-12 w-12 rounded object-cover" />
                  <Maximize2 className="absolute bottom-0 right-0 h-3 w-3 rounded bg-background/80 text-foreground" />
                </button>
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{a.name}</p>
                <p className="text-[11px] text-muted-foreground">{formatBytes(a.size)}</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => onChange(attachments.filter((_, idx) => idx !== i))}
                title="Remover"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!zoom} onOpenChange={(v) => !v && setZoom(null)}>
        <DialogContent className="max-w-3xl">
          {zoom && <img src={zoom} alt="Arquivo ampliado" className="max-h-[75vh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
