import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, GraduationCap, Link2, Pencil, Power } from "lucide-react";
import { toast } from "sonner";

type LinkRow = {
  id: string;
  seller_id: string;
  public_slug: string;
  active: boolean;
  created_at: string;
};
type Profile = { id: string; full_name: string | null; email: string | null };

const FORM_BASE_URL = "https://unitedidiomasbolsa.lovable.app/agendar";

function fullLink(slug: string) {
  return `${FORM_BASE_URL}/${slug}`;
}

// Aceita colagem de URL completa ou caminho e extrai só o último segmento.
export function normalizeSlug(input: string): string {
  const trimmed = input.trim().toLowerCase();
  const withoutQuery = trimmed.split(/[?#]/)[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const last = segments.length > 0 ? segments[segments.length - 1]! : "";
  return last.replace(/[^a-z0-9-]/g, "");
}

export function ScholarshipLinksCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: links = [], isLoading } = useQuery({
    queryKey: ["scholarship-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_seller_links")
        .select("id, seller_id, public_slug, active, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as LinkRow[];
    },
  });

  const { data: sellers = [] } = useQuery({
    queryKey: ["scholarship-link-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });

  const sellerName = (id: string) => {
    const p = sellers.find((s) => s.id === id);
    return p?.full_name || p?.email || "Vendedor";
  };

  const toggleActive = useMutation({
    mutationFn: async (row: LinkRow) => {
      const { error } = await supabase
        .from("public_seller_links")
        .update({ active: !row.active })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status do link atualizado");
      qc.invalidateQueries({ queryKey: ["scholarship-links"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (slug: string) => {
    await navigator.clipboard.writeText(fullLink(slug));
    toast.success("Link copiado");
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            Links do processo bolsista
          </h2>
          <p className="text-xs text-muted-foreground">
            Cada vendedor tem um link individual. Leads recebidos entram sempre na etapa “Novo”.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Link2 className="h-4 w-4 mr-1" />Novo link
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum link criado ainda.</p>
      ) : (
        <div className="space-y-2">
          {links.map((row) => (
            <div key={row.id} className="rounded-md border p-2 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{sellerName(row.seller_id)}</div>
                <div className="text-xs text-muted-foreground truncate">{fullLink(row.public_slug)}</div>
              </div>
              <Badge variant={row.active ? "default" : "secondary"}>{row.active ? "Ativo" : "Inativo"}</Badge>
              <Button size="sm" variant="ghost" onClick={() => copy(row.public_slug)} title="Copiar link">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(row)} title="Editar slug">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleActive.mutate(row)}
                title={row.active ? "Desativar" : "Ativar"}
              >
                <Power className={`h-3.5 w-3.5 ${row.active ? "text-rose-600" : "text-emerald-600"}`} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <LinkFormDialog
          row={editing}
          sellers={sellers}
          existing={links}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["scholarship-links"] })}
        />
      )}
    </Card>
  );
}

function LinkFormDialog({
  row,
  sellers,
  existing,
  onClose,
  onSaved,
}: {
  row: LinkRow | null;
  sellers: Profile[];
  existing: LinkRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sellerId, setSellerId] = useState(row?.seller_id ?? "");
  const [slug, setSlug] = useState(row?.public_slug ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const normalized = normalizeSlug(slug);
    if (!sellerId) { toast.error("Selecione o vendedor"); return; }
    if (!normalized) { toast.error("Informe o slug do vendedor"); return; }
    if (!/^[a-z0-9-]+$/.test(normalized)) { toast.error("Use apenas letras minúsculas, números e hífen"); return; }
    if (existing.some((l) => l.public_slug === normalized && l.id !== row?.id)) {
      toast.error("Este slug já está em uso");
      return;
    }
    if (!row && existing.some((l) => l.seller_id === sellerId && l.active)) {
      toast.warning("Este vendedor já possui um link ativo — evite duplicar sem necessidade.");
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id ?? null;
    const { error } = row
      ? await supabase
          .from("public_seller_links")
          .update({ seller_id: sellerId, public_slug: normalized, updated_by: uid })
          .eq("id", row.id)
      : await supabase
          .from("public_seller_links")
          .insert({ seller_id: sellerId, public_slug: normalized, created_by: uid, updated_by: uid });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(row ? "Link atualizado" : "Link criado");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? "Editar link" : "Novo link do processo bolsista"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Vendedor *</Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Slug do vendedor *</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="l" maxLength={200} />
            <p className="mt-1 text-xs text-muted-foreground">
              Digite apenas o código curto, por exemplo: l ou el. Não cole a URL completa.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{fullLink(normalizeSlug(slug) || "slug")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
