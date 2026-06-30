import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Period } from "@/lib/productivity";

export type Seller = { id: string; full_name: string | null; email: string };

export function PeriodFilter({
  period, setPeriod, customStart, setCustomStart, customEnd, setCustomEnd,
  sellers, vendedorId, setVendedorId,
}: {
  period: Period; setPeriod: (p: Period) => void;
  customStart: string; setCustomStart: (s: string) => void;
  customEnd: string; setCustomEnd: (s: string) => void;
  sellers?: Seller[]; vendedorId?: string | null; setVendedorId?: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex gap-1">
        {(["hoje", "semana", "mes", "custom"] as const).map((p) => (
          <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
            {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : p === "mes" ? "Mês" : "Custom"}
          </Button>
        ))}
      </div>
      {period === "custom" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-36" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-36" />
          </div>
        </>
      )}
      {sellers && setVendedorId && (
        <div className="min-w-[200px]">
          <label className="text-xs text-muted-foreground">Vendedor</label>
          <Select value={vendedorId ?? "all"} onValueChange={(v) => setVendedorId(v === "all" ? null : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
