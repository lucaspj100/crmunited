import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useBrand } from "@/lib/brand";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings, Upload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/configuracoes")({ component: ConfigPage });

function ConfigPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const qc = useQueryClient();
  const { data: brand } = useBrand();
  const [name, setName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (brand) {
      setName(brand.brand_name);
      setSubtitle(brand.brand_subtitle);
    }
  }, [brand]);

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const saveText = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ brand_name: name.trim() || "Comercial", brand_subtitle: subtitle.trim() })
      .eq("id", true);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Textos atualizados");
    qc.invalidateQueries({ queryKey: ["brand"] });
  };

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Selecione uma imagem");
    if (file.size > 5 * 1024 * 1024) return toast.error("Máximo 5MB");
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `logo-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (up.error) { setUploading(false); return toast.error(up.error.message); }
    const { error } = await supabase.from("app_settings").update({ logo_path: path }).eq("id", true);
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Logo atualizada");
    qc.invalidateQueries({ queryKey: ["brand"] });
  };

  const removeLogo = async () => {
    if (brand?.logo_path) await supabase.storage.from("branding").remove([brand.logo_path]);
    await supabase.from("app_settings").update({ logo_path: null }).eq("id", true);
    toast.success("Logo removida");
    qc.invalidateQueries({ queryKey: ["brand"] });
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Settings className="h-6 w-6 text-primary" />Configurações</h1>
        <p className="text-sm text-muted-foreground">Identidade visual exibida na barra lateral</p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Logo</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-sidebar overflow-hidden border">
            {brand?.logo_url ? (
              <img src={brand.logo_url} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sidebar-primary-foreground bg-sidebar-primary h-full w-full flex items-center justify-center font-bold">
                {(brand?.brand_name ?? "C").charAt(0)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="h-4 w-4 mr-2" />{uploading ? "Enviando…" : "Enviar imagem"}
            </Button>
            {brand?.logo_path && (
              <Button variant="ghost" onClick={removeLogo}>Remover</Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG ou SVG até 5MB. Quadrado recomendado.</p>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">Textos</h2>
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="subtitle">Subtítulo</Label>
          <Input id="subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={60} />
        </div>
        <Button onClick={saveText} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </Card>
    </div>
  );
}
