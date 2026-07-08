import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { changeOwnPassword } from "@/lib/user-admin.functions";
import { useAuth } from "@/lib/auth-context";

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return "Mínimo de 8 caracteres";
  if (!/[A-Z]/.test(pw)) return "Precisa de ao menos 1 letra maiúscula";
  if (!/[0-9]/.test(pw)) return "Precisa de ao menos 1 número";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Precisa de ao menos 1 caractere especial";
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  forced?: boolean; // when true, hides close button and requires success
}

export function ChangePasswordDialog({ open, onOpenChange, forced }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const fn = useServerFn(changeOwnPassword);
  const { refreshMustChange } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return toast.error("Senhas não conferem");
    const err = validatePasswordStrength(next);
    if (err) return toast.error(err);
    setBusy(true);
    try {
      await fn({ data: { currentPassword: forced ? undefined : current, newPassword: next } });
      toast.success("Senha alterada com sucesso");
      setCurrent(""); setNext(""); setConfirm("");
      await refreshMustChange();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!forced || !v) onOpenChange(v); }}>
      <DialogContent onInteractOutside={(e) => { if (forced) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (forced) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{forced ? "Defina uma nova senha" : "Alterar senha"}</DialogTitle>
          <DialogDescription>
            {forced
              ? "Sua senha foi redefinida pelo administrador. Crie uma nova senha para continuar."
              : "Use uma senha forte com 8+ caracteres, maiúscula, número e caractere especial."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {!forced && (
            <div>
              <Label>Senha atual</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </div>
          )}
          <div>
            <Label>Nova senha</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
          </div>
          <div>
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <DialogFooter>
            {!forced && <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>}
            <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
