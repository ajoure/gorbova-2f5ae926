import type { TrainingModule } from "@/hooks/useTrainingModules";

export type SortMode = "order" | "alpha";

export interface ModuleTreeNode {
  module: TrainingModule;
  children: ModuleTreeNode[];
}

/** Generic typed tree node with arbitrary leaf data */
export interface ModuleTreeNodeWithData<T> {
  module: TrainingModule;
  children: ModuleTreeNodeWithData<T>[];
  items: T[];
}

/* ── Sort helpers ─────────────────────────────────────────── */

export function sortModules(list: TrainingModule[], sortMode: SortMode): TrainingModule[] {
  if (sortMode === "alpha") {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }
  return [...list].sort((a, b) => {
    const ao = a.sort_order ?? 0;
    const bo = b.sort_order ?? 0;
    if (ao !== bo) return ao - bo;
    const ca = (a.created_at || "").localeCompare(b.created_at || "");
    if (ca !== 0) return ca;
    return a.title.localeCompare(b.title, "ru");
  });
}

export function sortItems<T extends { sort_order?: number | null; created_at?: string | null; title: string }>(
  list: T[],
  sortMode: SortMode,
): T[] {
  if (sortMode === "alpha") {
    return [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"));
  }
  return [...list].sort((a, b) => {
    const ao = (a.sort_order as number) ?? 0;
    const bo = (b.sort_order as number) ?? 0;
    if (ao !== bo) return ao - bo;
    const ca = (a.created_at || "").localeCompare(b.created_at || "");
    if (ca !== 0) return ca;
    return a.title.localeCompare(b.title, "ru");
  });
}

/* ── Tree builder ─────────────────────────────────────────── */

/**
 * Build a recursive tree from flat module list.
 * Optionally attach items (lessons, etc.) keyed by module_id.
 */
export function buildModuleTree<T extends { module_id: string }>(
  modules: TrainingModule[],
  items: T[],
  sortMode: SortMode,
  sortItemsFn?: (list: T[], sortMode: SortMode) => T[],
): ModuleTreeNodeWithData<T>[] {
  const itemsByModule = new Map<string, T[]>();
  for (const item of items) {
    const arr = itemsByModule.get(item.module_id) || [];
    arr.push(item);
    itemsByModule.set(item.module_id, arr);
  }

  const childrenMap = new Map<string | null, TrainingModule[]>();
  for (const m of modules) {
    const parentKey = m.parent_module_id || null;
    const arr = childrenMap.get(parentKey) || [];
    arr.push(m);
    childrenMap.set(parentKey, arr);
  }

  const sorter = sortItemsFn || ((list: T[]) => list);

  const buildNode = (parentId: string | null): ModuleTreeNodeWithData<T>[] => {
    const children = childrenMap.get(parentId) || [];
    return sortModules(children, sortMode).map((m) => ({
      module: m,
      children: buildNode(m.id),
      items: sorter(itemsByModule.get(m.id) || [], sortMode),
    }));
  };

  return buildNode(null);
}

/* ── Expanded state helpers ───────────────────────────────── */

const MAX_STORED_IDS = 500;

export function loadExpandedIds(storageKey: string): Set<string> {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return new Set();
    const parsed: string[] = JSON.parse(saved);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

export function saveExpandedIds(storageKey: string, ids: Set<string>): void {
  const arr = Array.from(ids).slice(0, MAX_STORED_IDS);
  localStorage.setItem(storageKey, JSON.stringify(arr));
}

export function filterExpandedIds(ids: Set<string>, validIds: Set<string>): Set<string> {
  const filtered = new Set<string>();
  for (const id of ids) {
    if (validIds.has(id)) filtered.add(id);
  }
  return filtered;
}

export function toggleExpandedId(
  prev: Set<string>,
  id: string,
  storageKey: string,
): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  saveExpandedIds(storageKey, next);
  return next;
}
