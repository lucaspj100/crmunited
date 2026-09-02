import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CALL_COUNT_LABEL,
  CALL_RESULT_LABEL,
  EMPTY_FILTERS,
  LAST_ATTEMPT_LABEL,
  SHORTCUTS,
  STATUS_OPTIONS,
  WHATSAPP_LABEL,
  hasActiveFilters,
  type CallCountMode,
  type CallCountOp,
  type CallResultMode,
  type DialerFilters,
  type LastAttemptMode,
  type WhatsappMode,
} from "@/lib/dialer-filters";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: DialerFilters;
  onApply: (f: DialerFilters) => void;
  onClear: () => void;
  previewCount: (f: DialerFilters) => number;
  loadingHistory?: boolean;
};

export function QueueFilterDialog({ open, onOpenChange, value, onApply, onClear, previewCount, loadingHistory }: Props) {
  const [draft, setDraft] = useState<DialerFilters>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const set = <K extends keyof DialerFilters>(key: K, v: DialerFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));

  const toggleStatus = (s: string) =>
    setDraft((d) => ({
      ...d,
      statuses: d.statuses.includes(s) ? d.statuses.filter((x) => x !== s) : [...d.statuses, s],
    }));

  const count = previewCount(draft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtrar fila</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Atalhos rápidos</Label>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setDraft({ ...EMPTY_FILTERS, ...s.patch })}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Quantidade de ligações</Label>
              <Select value={draft.callCount} onValueChange={(v) => set("callCount", v as CallCountMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CALL_COUNT_LABEL) as CallCountMode[]).map((k) => (
                    <SelectItem key={k} value={k}>{CALL_COUNT_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draft.callCount === "custom" && (
                <div className="flex gap-2">
                  <Select value={draft.callCountOp} onValueChange={(v) => set("callCountOp", v as CallCountOp)}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">Igual a</SelectItem>
                      <SelectItem value="gte">Ou mais</SelectItem>
                      <SelectItem value="lte">Ou menos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    value={draft.callCountValue}
                    onChange={(e) => set("callCountValue", Number(e.target.value))}
                  />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Resultado das ligações</Label>
              <Select value={draft.callResult} onValueChange={(v) => set("callResult", v as CallResultMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CALL_RESULT_LABEL) as CallResultMode[]).map((k) => (
                    <SelectItem key={k} value={k}>{CALL_RESULT_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Select value={draft.whatsapp} onValueChange={(v) => set("whatsapp", v as WhatsappMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(WHATSAPP_LABEL) as WhatsappMode[]).map((k) => (
                    <SelectItem key={k} value={k}>{WHATSAPP_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Data da última tentativa</Label>
              <Select value={draft.lastAttempt} onValueChange={(v) => set("lastAttempt", v as LastAttemptMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LAST_ATTEMPT_LABEL) as LastAttemptMode[]).map((k) => (
                    <SelectItem key={k} value={k}>{LAST_ATTEMPT_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {draft.lastAttempt === "custom" && (
                <div className="flex gap-2">
                  <Input type="date" value={draft.lastAttemptFrom} onChange={(e) => set("lastAttemptFrom", e.target.value)} />
                  <Input type="date" value={draft.lastAttemptTo} onChange={(e) => set("lastAttemptTo", e.target.value)} />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Situação atual do contato</Label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((s) => {
                const active = draft.statuses.includes(s);
                return (
                  <Button
                    key={s}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="h-8 text-xs"
                    onClick={() => toggleStatus(s)}
                  >
                    {s}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>DDD</Label>
              <Input value={draft.ddd} onChange={(e) => set("ddd", e.target.value)} placeholder="Ex.: 11" inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={draft.empresa} onChange={(e) => set("empresa", e.target.value)} placeholder="contém…" />
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input value={draft.origem} onChange={(e) => set("origem", e.target.value)} placeholder="contém…" />
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {loadingHistory ? (
              "Carregando histórico de tentativas…"
            ) : (
              <>
                <Badge variant="secondary">{count}</Badge>{" "}
                {hasActiveFilters(draft) ? "contatos atendem a esses filtros" : "contatos na fila (sem filtro)"}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              onClear();
              onOpenChange(false);
            }}
          >
            Limpar filtros
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Aplicar filtros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
