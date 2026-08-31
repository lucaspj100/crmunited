import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Network, Star, Users } from "lucide-react";
import { toast } from "sonner";
import {
  CAREER_ROLE_LABELS,
  QUOTAS_TO_MASTER,
  isLeaderRole,
  showsStars,
  useCareerTree,
  useSetCareerLeader,
  type CareerTreeNode,
} from "@/lib/career";

const NO_LEADER = "__none__";

type TreeIndex = {
  byId: Map<string, CareerTreeNode>;
  children: Map<string, CareerTreeNode[]>;
  roots: CareerTreeNode[];
};

function buildIndex(nodes: CareerTreeNode[]): TreeIndex {
  const byId = new Map(nodes.map((n) => [n.user_id, n]));
  const children = new Map<string, CareerTreeNode[]>();
  const roots: CareerTreeNode[] = [];
  for (const n of nodes) {
    if (n.leader_id && byId.has(n.leader_id) && n.leader_id !== n.user_id) {
      const list = children.get(n.leader_id) ?? [];
      list.push(n);
      children.set(n.leader_id, list);
    } else {
      roots.push(n);
    }
  }
  const byName = (a: CareerTreeNode, b: CareerTreeNode) => a.full_name.localeCompare(b.full_name, "pt-BR");
  roots.sort(byName);
  for (const list of children.values()) list.sort(byName);
  return { byId, children, roots };
}

function NodeRow({
  node,
  index,
  depth,
  editable,
  allNodes,
  expanded,
  toggle,
}: {
  node: CareerTreeNode;
  index: TreeIndex;
  depth: number;
  editable: boolean;
  allNodes: CareerTreeNode[];
  expanded: Set<string>;
  toggle: (id: string) => void;
}) {
  const kids = index.children.get(node.user_id) ?? [];
  const isOpen = expanded.has(node.user_id);
  const setLeader = useSetCareerLeader();

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/60"
        style={{ marginLeft: depth * 18 }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => toggle(node.user_id)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={isOpen ? "Recolher" : "Expandir"}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block h-4 w-4" />
        )}

        <span className="text-sm font-medium">{node.full_name}</span>
        <Badge variant="secondary">{CAREER_ROLE_LABELS[node.career_role] ?? node.career_role}</Badge>

        {showsStars(node.career_role) && (
          <span className="inline-flex items-center gap-0.5 text-xs text-amber-500">
            <Star className="h-3 w-3 fill-current" /> {node.career_stars}
          </span>
        )}

        {isLeaderRole(node.career_role) && (
          <Badge variant="outline">
            {node.career_quotas} / {QUOTAS_TO_MASTER} cotas
          </Badge>
        )}

        <span className="text-xs text-muted-foreground">
          Estrutura no mês: <strong className="text-foreground">{node.structure_month_points}</strong> pts
          {isLeaderRole(node.career_role) && <> · próprios: {node.month_points}</>}
        </span>

        {kids.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" /> {kids.length}
          </span>
        )}

        {editable && (
          <div className="ml-auto w-[220px]">
            <Select
              value={node.leader_id ?? NO_LEADER}
              onValueChange={(v) =>
                setLeader.mutate(
                  { userId: node.user_id, leaderId: v === NO_LEADER ? null : v },
                  {
                    onSuccess: () => toast.success("Líder direto atualizado"),
                    onError: (e) => toast.error((e as Error).message),
                  },
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Líder direto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LEADER}>Sem líder direto</SelectItem>
                {allNodes
                  .filter((n) => n.user_id !== node.user_id)
                  .map((n) => (
                    <SelectItem key={n.user_id} value={n.user_id}>
                      {n.full_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isOpen &&
        kids.map((k) => (
          <NodeRow
            key={k.user_id}
            node={k}
            index={index}
            depth={depth + 1}
            editable={editable}
            allNodes={allNodes}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
    </div>
  );
}

/** Árvore de liderança: ADM configura o líder direto; demais usuários visualizam sua estrutura. */
export function LeadershipTree({ editable, root }: { editable: boolean; root?: string }) {
  const { data: nodes, isLoading, error } = useCareerTree(root, true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const index = useMemo(() => buildIndex(nodes ?? []), [nodes]);

  if (!initialized && (nodes?.length ?? 0) > 0) {
    setExpanded(new Set((nodes ?? []).map((n) => n.user_id)));
    setInitialized(true);
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = search.trim().toLowerCase();
  const matches = q
    ? (nodes ?? []).filter(
        (n) => n.full_name.toLowerCase().includes(q) || (n.email ?? "").toLowerCase().includes(q),
      )
    : null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4 text-primary" /> Estrutura da equipe
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-[200px] text-xs"
            placeholder="Buscar pessoa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setExpanded(new Set((nodes ?? []).map((n) => n.user_id)))}
          >
            Expandir tudo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(new Set())}>
            Recolher tudo
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando estrutura…</div>}
      {error && <div className="text-sm text-destructive">{(error as Error).message}</div>}

      {matches ? (
        <div className="space-y-1">
          {matches.map((n) => (
            <NodeRow
              key={n.user_id}
              node={n}
              index={{ ...index, children: new Map() }}
              depth={0}
              editable={editable}
              allNodes={nodes ?? []}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
          {matches.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhuma pessoa encontrada.</div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {index.roots.map((n) => (
            <NodeRow
              key={n.user_id}
              node={n}
              index={index}
              depth={0}
              editable={editable}
              allNodes={nodes ?? []}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
          {!isLoading && index.roots.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhuma pessoa na estrutura.</div>
          )}
        </div>
      )}

      {editable && (
        <p className="text-xs text-muted-foreground">
          A hierarquia é livre: qualquer pessoa pode responder diretamente a qualquer líder. Alterações que
          criariam um ciclo são bloqueadas automaticamente.
        </p>
      )}
    </Card>
  );
}
