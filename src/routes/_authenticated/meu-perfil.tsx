import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, User, Trash2, KeyRound } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";

export const Route = createFileRoute("/_authenticated/meu-perfil")({ component: MeuPerfil });

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Redimensiona imagem para ~256px e devolve dataURL JPEG (~30-60KB)
async function resizeToDataUrl(file: File, max = 256, quality = 0.82): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function MeuPerfil() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const { data: profile } = useQuery({
    enabled: !!user,
    queryKey: ["my_profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const onPick = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem");
    if (file.size > 5 * 1024 * 1024) return toast.error("Máximo 5MB");
    setBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      const { error } = await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", user!.id);
      if (error) throw error;
      toast.success("Foto atualizada");
      qc.invalidateQueries({ queryKey: ["my_profile", user?.id] });
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao salvar foto");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user!.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Foto removida");
    qc.invalidateQueries({ queryKey: ["my_profile", user?.id] });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><User className="h-6 w-6 text-primary" />Meu perfil</h1>
        <p className="text-sm text-muted-foreground">Sua foto aparece no telão do placar comercial.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full overflow-hidden border bg-gradient-to-br from-sky-500 to-violet-600 text-white font-bold text-xl">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              : initials(profile?.full_name ?? profile?.email)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{profile?.full_name || profile?.email}</div>
            <div className="text-xs text-muted-foreground truncate">{profile?.email}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ""; }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4 mr-2" />{busy ? "Salvando…" : "Enviar foto"}
          </Button>
          {profile?.avatar_url && (
            <Button variant="ghost" onClick={remove} disabled={busy}>
              <Trash2 className="h-4 w-4 mr-2" />Remover
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">PNG ou JPG. A foto é redimensionada automaticamente.</p>
      </Card>
    </div>
  );
}
