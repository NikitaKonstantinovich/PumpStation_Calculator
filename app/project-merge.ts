import type { ProjectConfig } from "./project-config";

// PostgreSQL JSONB does not preserve object-key order. Missing optional values
// also become absent keys after JSON serialization, rather than undefined.
export function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a).filter(key => a[key] !== undefined);
  return keys.length === Object.keys(b).filter(key => b[key] !== undefined).length && keys.every(key => sameJson(a[key], b[key]));
}

export function sameProject(left: ProjectConfig | null, right: ProjectConfig): boolean {
  return Boolean(left && sameJson({...left, project: {...left.project, updatedAt: undefined}}, {...right, project: {...right.project, updatedAt: undefined}}));
}

// Merge only independent edits. Arrays are indivisible: silently combining
// reordered specification rows or CAD operations could corrupt a saved station.
export function mergeProjectChanges(base: ProjectConfig, local: ProjectConfig, remote: ProjectConfig) {
  const conflicts: string[] = [];
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const merge = (before: unknown, ours: unknown, theirs: unknown, path: string): unknown => {
    if (path === "project.updatedAt") return [ours, theirs].filter(value => typeof value === "string").sort().at(-1);
    if (sameJson(ours, theirs) || sameJson(before, theirs)) return ours;
    if (sameJson(before, ours)) return theirs;
    if (object(before) && object(ours) && object(theirs)) {
      const result: Record<string, unknown> = {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(ours), ...Object.keys(theirs)])) {
        const value = merge(before[key], ours[key], theirs[key], path ? `${path}.${key}` : key);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    conflicts.push(path);
    return ours;
  };
  if (base.project.id !== local.project.id || base.project.id !== remote.project.id) return {config: local, conflicts: ["project.id"]};
  return {config: merge(base, local, remote, "") as ProjectConfig, conflicts};
}
