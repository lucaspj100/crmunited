import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Download, Share2, Copy, Loader2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrand } from "@/lib/brand";
import { AchievementCard } from "@/components/hall/AchievementCard";
import {
  FORMATS, TEMPLATES, TITLE_OPTIONS, DEFAULT_PHRASE, buildCaption, fileNameFor,
  logShare, saveSharePrefs, toDataUrl, usePhrases, useSharePrefs, pieceTexts,
  type ShareFormat, type ShareSubject, type ShareTemplate, type TitleKey,
} from "@/lib/achievement-share";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  subject: ShareSubject;
  official: boolean;
  year: number;
  month: number;
  currentUserId: string | null;
};

export function ShareAchievementDialog({ open, onOpenChange, subject, official, year, month, currentUserId }: Props) {
  const { data: brand } = useBrand();
  const { data: phrases = [DEFAULT_PHRASE] } = usePhrases();
  const { data: prefs } = useSharePrefs(currentUserId);

  const [format, setFormat] = useState<ShareFormat>("story");
  const [template, setTemplate] = useState<ShareTemplate>(subject.kind === "top3" || (subject.kind === "solo" && subject.position > 1) ? "podium" : "royalty");
  const [titleKey, setTitleKey] = useState<TitleKey>("sales_champion");
  const [phrase, setPhrase] = useState(DEFAULT_PHRASE);
  const [showPhoto, setShowPhoto] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [offsetY, setOffsetY] = useState(0);
  const [caption, setCaption] = useState("");
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewW, setPreviewW] = useState(360);

  const cardRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const people = subject.kind === "top3" ? subject.people : [subject.person];

  // Preferências salvas do usuário.
  useEffect(() => {
    if (!prefs) return;
    setTitleKey(prefs.preferred_title);
    setFormat(prefs.preferred_format);
    if (subject.kind === "solo" && subject.position === 1) setTemplate(prefs.preferred_template);
    if (prefs.preferred_phrase) setPhrase(prefs.preferred_phrase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  // Fotos externas convertidas em data URL (evita bloqueio na captura).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        people.map(async (p) => [p.id, p.avatar_url ? await toDataUrl(p.avatar_url) : null] as const),
      );
      if (!cancelled) setPhotos(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subject]);

  useEffect(() => {
    if (!open || !brand?.logo_url) return;
    let cancelled = false;
    void toDataUrl(brand.logo_url).then((d) => { if (!cancelled) setLogo(d); });
    return () => { cancelled = true; };
  }, [open, brand?.logo_url]);

  // Legenda automática (regerada quando os parâmetros mudam, mas editável).
  useEffect(() => {
    setCaption(buildCaption({ subject, titleKey, official, year, month }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, titleKey, official, year, month]);

  // Largura da prévia responsiva.
  useEffect(() => {
    if (!open) return;
    const measure = () => setPreviewW(Math.max(240, Math.min(boxRef.current?.clientWidth ?? 360, 420)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, format]);

  const fmt = FORMATS[format];
  const maxPreviewH = format === "story" ? 520 : 460;
  const scale = Math.min(previewW / fmt.w, maxPreviewH / fmt.h);

  const texts = pieceTexts({ subject, titleKey, official, year, month });
  const achievementLabel = texts.headline;
  const position = subject.kind === "solo" ? subject.position : null;
  const subjectUserId = subject.kind === "solo" ? subject.person.id : null;

  const persist = () => {
    if (!currentUserId) return;
    void saveSharePrefs(currentUserId, {
      preferred_title: titleKey,
      preferred_template: template,
      preferred_format: format,
      preferred_phrase: phrase,
    });
  };

  const render = async (): Promise<Blob> => {
    const node = cardRef.current;
    if (!node) throw new Error("Prévia indisponível.");
    if (typeof document !== "undefined" && "fonts" in document) {
      await (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready;
    }
    const dataUrl = await toPng(node, {
      width: fmt.w, height: fmt.h, pixelRatio: 1, cacheBust: true,
      style: { transform: "none", margin: "0" },
    });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const log = (action: "generated" | "download" | "share" | "copy_caption") => {
    if (!currentUserId) return;
    void logShare({
      userId: currentUserId, subjectUserId, year, month,
      achievement: achievementLabel, position, format, template, action, official,
    });
  };

  const fileName = fileNameFor({
    nome: subject.kind === "solo" ? subject.person.nome : "top-3",
    year, month, format,
  });

  const doDownload = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await render();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      persist(); log("generated"); log("download");
      toast.success("Imagem baixada.");
    } catch (e) {
      setError((e as Error).message || "Não foi possível gerar a imagem.");
    } finally { setBusy(false); }
  };

  const doShare = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await render();
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: caption });
        persist(); log("generated"); log("share");
        toast.success("Conteúdo enviado para o compartilhamento.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        try { await navigator.clipboard.writeText(caption); } catch { /* ignore */ }
        persist(); log("generated"); log("download");
        toast.success("Seu navegador não permite compartilhar direto — imagem baixada e legenda copiada.");
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") { setBusy(false); return; }
      setError((e as Error).message || "Não foi possível gerar a imagem.");
    } finally { setBusy(false); }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      log("copy_caption");
      toast.success("Legenda copiada.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const showTitlePicker = subject.kind === "solo" && subject.position === 1 && official;

  const cardProps = useMemo(() => ({
    subject, photos, showPhoto, photoZoom: zoom, photoOffsetY: offsetY,
    titleKey, phrase, official, year, month, format, template, logoUrl: logo,
  }), [subject, photos, showPhoto, zoom, offsetY, titleKey, phrase, official, year, month, format, template, logo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>📲 Compartilhar conquista</DialogTitle>
          <DialogDescription>
            Peça de reconhecimento da Equipe Fanáticos. Nenhuma métrica ou dado interno é incluído na imagem.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Prévia */}
          <div ref={boxRef} className="flex flex-col items-center gap-3">
            <div
              className="overflow-hidden rounded-xl border border-border shadow-lg"
              style={{ width: fmt.w * scale, height: fmt.h * scale }}
            >
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: fmt.w, height: fmt.h }}>
                <AchievementCard ref={cardRef} {...cardProps} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {fmt.label} · {fmt.w}×{fmt.h} · {fmt.hint}
            </p>
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
                <Button size="sm" variant="ghost" onClick={doDownload}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Tentar novamente
                </Button>
              </div>
            )}
          </div>

          {/* Personalização */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Formato</Label>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(FORMATS) as ShareFormat[]).map((f) => (
                  <Button key={f} type="button" size="sm" variant={format === f ? "default" : "outline"} onClick={() => setFormat(f)}>
                    {FORMATS[f].label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Modelo visual</Label>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(TEMPLATES) as ShareTemplate[]).map((t) => (
                  <Button key={t} type="button" size="sm" variant={template === t ? "default" : "outline"} onClick={() => setTemplate(t)}>
                    {TEMPLATES[t].label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{TEMPLATES[template].hint}</p>
            </div>

            {showTitlePicker && (
              <div className="space-y-1.5">
                <Label className="text-xs">Título da conquista</Label>
                <Select value={titleKey} onValueChange={(v) => setTitleKey(v as TitleKey)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TITLE_OPTIONS.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Sua escolha fica salva para os próximos compartilhamentos.</p>
              </div>
            )}
            {!showTitlePicker && subject.kind === "solo" && subject.position === 1 && (
              <p className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                O mês ainda não foi encerrado: a peça sai como <strong>liderança parcial</strong>. Os títulos oficiais ficam disponíveis após o fechamento.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Frase</Label>
              <Select value={phrase} onValueChange={setPhrase}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {phrases.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Exibir foto</Label>
              <Switch checked={showPhoto} onCheckedChange={setShowPhoto} />
            </div>

            {showPhoto && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Zoom da foto</Label>
                  <Slider value={[zoom]} min={1} max={2} step={0.05} onValueChange={([v]) => setZoom(v)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Enquadramento vertical</Label>
                  <Slider value={[offsetY]} min={-25} max={25} step={1} onValueChange={([v]) => setOffsetY(v)} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Legenda da publicação</Label>
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={7} className="text-xs" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button type="button" variant="outline" onClick={copyCaption}>
            <Copy className="mr-1 h-4 w-4" /> Copiar legenda
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={doDownload}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Baixar imagem
          </Button>
          <Button type="button" disabled={busy} onClick={doShare}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Share2 className="mr-1 h-4 w-4" />} 📲 Compartilhar conquista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
