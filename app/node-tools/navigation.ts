import { compileTree, childDiagram } from "../engineering/hierarchy";
import type { Address } from "../engineering/canvas-layout";
import type { Document, Diagram, GraphNode } from "../engineering/schema";
import type { Step } from "../engineering/engine";

export type NodeDestination = { address: Address; label: string };
export type FieldRepresentation = NodeDestination & { visible: boolean; condition?: Address };
export const addressId = (address: Address) => [...address.path, address.node].join("/");
const nodeName = (node: GraphNode) => typeof node.values.title === "string" && node.values.title ? node.values.title : node.name;

/** Resolve a trace address without choosing the first use of a shared definition. */
export function addressFromTrace(doc: Document, root: string, id: string): Address | null {
  const parts = id.split("/"), path = parts.slice(0, -1);
  let graph = doc.diagrams.find(g => g.id === root);
  for (const part of path) {
    const node = graph?.nodes.find(n => n.id === part);
    const type = doc.types.find(t => t.id === node?.type);
    const next = type && graph && childDiagram(type, graph.id);
    graph = doc.diagrams.find(g => g.id === next);
  }
  return graph?.nodes.some(n => n.id === parts.at(-1)) ? { graph: graph.id, path, node: parts.at(-1)! } : null;
}

export function graphBreadcrumbs(doc: Document, root: string, selected: Address): NodeDestination[] {
  let graph = doc.diagrams.find(g => g.id === root);
  if (!graph) return [];
  const crumbs: NodeDestination[] = [{ label: graph.name, address: { graph: root, path: [], node: "source" } }];
  const path: string[] = [];
  for (const id of selected.path) {
    const node = graph.nodes.find(n => n.id === id);
    const type = doc.types.find(t => t.id === node?.type);
    if (!node || !type) break;
    crumbs.push({ label: nodeName(node), address: { graph: graph.id, path: [...path], node: id } });
    const next = childDiagram(type, graph.id);
    const child = doc.diagrams.find(g => g.id === next);
    if (!child) break;
    graph = child;
    path.push(id);
  }
  const node = graph.nodes.find(n => n.id === selected.node);
  if (node && !crumbs.some(c => addressId(c.address) === addressId(selected))) crumbs.push({ label: nodeName(node), address: selected });
  return crumbs;
}

function parameterNode(doc: Document, graph: Diagram, node: GraphNode): GraphNode | undefined {
  const type = doc.types.find(t => t.id === node.type);
  if (type?.parameter) return node;
  if (type?.operation !== "field") return undefined;
  const binding = graph.edges.find(e => e.to === node.id && e.input === "binding");
  const source = graph.nodes.find(n => n.id === binding?.from);
  return doc.types.find(t => t.id === source?.type)?.parameter ? source : undefined;
}

/** Binding identity is forwarded unchanged by the typed source/result boundaries. */
function bindingResolver(steps: Step[]) {
  const nodes = new Map(steps.map(step => [step.id, step]));
  return (id: string): string | undefined => {
    const step = nodes.get(id);
    if (step?.operation === "parameter") return id;
    if (step?.operation !== "field") return undefined;
    const edge = step.links.find(link => link.input === "binding");
    if (!edge) return undefined;
    const seen = new Set<string>();
    function follow(id: string, port: string): string | undefined {
      const key = id + ":" + port;
      if (seen.has(key)) return undefined;
      seen.add(key);
      const source = nodes.get(id);
      if (source?.operation === "parameter" && port === "binding") return id;
      if (!source || source.operation || source.expressions[port] || !/(?:^|\/)(?:source|result)$/.test(id)) return undefined;
      const input = source.links.find(link => link.input === port);
      return input ? follow(input.from, input.out) : undefined;
    }
    return follow(edge.from, edge.out);
  };
}

function representation(doc: Document, address: Address, name: string): FieldRepresentation | null {
  const graph = doc.diagrams.find(g => g.id === address.graph), field = graph?.nodes.find(n => n.id === address.node);
  if (!graph || !field) return null;
  const visibility = graph.edges.find(edge => edge.to === field.id && edge.input === "visible");
  const pending = [field.id], seen = new Set<string>();
  let condition: string | undefined = visibility?.from;
  while (pending.length && !condition) {
    const id = pending.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of graph.edges.filter(e => e.from === id).map(e => e.to)) {
      const operation = doc.types.find(t => t.id === graph.nodes.find(n => n.id === next)?.type)?.operation;
      if (operation === "condition") { condition = next; break; }
      if (operation && ["section", "grid"].includes(operation)) pending.push(next);
    }
  }
  return { address, label: String(field.values.label || "Поле «" + name + "»"), visible: field.values.visible !== false, ...(condition ? { condition: { ...address, node: condition } } : {}) };
}

/** All representations in the selected instance, preserving the binding and UI order. */
export function parameterRepresentations(doc: Document, address: Address, root?: string): FieldRepresentation[] {
  const graph = doc.diagrams.find(g => g.id === address.graph), node = graph?.nodes.find(n => n.id === address.node);
  if (!graph || !node) return [];
  try {
    const base = doc.diagrams.find(g => g.id === (root ?? address.graph))!;
    const steps = compileTree(doc, base).steps;
    const resolve = bindingResolver(steps), id = resolve(root ? addressId(address) : address.node);
    if (id) {
      const name = steps.find(step => step.id === id)?.parameter?.field.name || node.name;
      return steps.filter(step => step.operation === "field" && resolve(step.id) === id).flatMap(step => {
        const local = addressFromTrace(doc, base.id, step.id);
        if (!local) return [];
        const target = root ? local : { ...local, path: [...address.path, ...local.path] };
        const field = representation(doc, target, name);
        return field ? [field] : [];
      });
    }
  } catch { /* An incomplete draft can still expose directly connected fields. */ }
  const parameter = parameterNode(doc, graph, node);
  if (!parameter) return [];
  return graph.edges.filter(e => e.from === parameter.id && e.out === "binding" && e.input === "binding").flatMap(edge => {
    const field = graph.nodes.find(n => n.id === edge.to);
    if (!field || doc.types.find(t => t.id === field.type)?.operation !== "field") return [];
    const parameterName = doc.types.find(t => t.id === parameter.type)?.parameter?.field.name || parameter.name;
    const result = representation(doc, { ...address, node: field.id }, parameterName);
    return result ? [result] : [];
  });
}

/** Collect before/after paths on the expanded executable graph, including Instrument boundaries. */
export function provenance(doc: Document, root: string, selected: Address): {
  ids: Set<string>; sources: NodeDestination[]; consumers: NodeDestination[]; parameter?: Address;
} {
  const graph = doc.diagrams.find(g => g.id === selected.graph), node = graph?.nodes.find(n => n.id === selected.node);
  const parameter = graph && node && parameterNode(doc, graph, node);
  let parameterAddress = parameter ? { ...selected, node: parameter.id } : undefined;
  let links: { from: string; to: string }[];
  try {
    const base = doc.diagrams.find(g => g.id === root);
    const steps = base ? compileTree(doc, base).steps : [];
    const id = bindingResolver(steps)(addressId(selected));
    if (id) parameterAddress = addressFromTrace(doc, root, id) ?? parameterAddress;
    links = steps.flatMap(step => step.links.map(link => ({ from: link.from, to: step.id })));
  } catch {
    links = graph?.edges.map(edge => ({ from: addressId({ ...selected, node: edge.from }), to: addressId({ ...selected, node: edge.to }) })) ?? [];
  }
  const seeds = new Set([addressId(selected), ...(parameterAddress ? [addressId(parameterAddress)] : [])]);
  // Containers are represented by their boundary nodes in the executable graph.
  const allIds = new Set(links.flatMap(link => [link.from, link.to]));
  for (const seed of [...seeds]) if (!allIds.has(seed)) {
    if (allIds.has(seed + "/source")) seeds.add(seed + "/source");
    if (allIds.has(seed + "/result")) seeds.add(seed + "/result");
  }
  const walk = (upstream: boolean) => {
    const found = new Set(seeds), todo = [...seeds];
    while (todo.length) {
      const current = todo.pop()!;
      for (const link of links) {
        const next = upstream ? link.from : link.to;
        if ((upstream ? link.to : link.from) === current && !found.has(next)) { found.add(next); todo.push(next); }
      }
    }
    return found;
  };
  const up = walk(true), down = walk(false), ids = new Set([...up, ...down]);
  // Keep ancestor cards visible while their nested chain is selected.
  for (const id of [...ids]) {
    const parts = id.split("/");
    while (parts.length > 1) { parts.pop(); ids.add(parts.join("/")); }
  }
  const destination = (id: string): NodeDestination | null => {
    const address = addressFromTrace(doc, root, id);
    if (!address) return null;
    const g = doc.diagrams.find(g => g.id === address.graph), n = g?.nodes.find(n => n.id === address.node);
    return n ? { address, label: nodeName(n) + (address.path.length ? " · " + graphBreadcrumbs(doc, root, address).slice(1, -1).map(c => c.label).join(" → ") : "") } : null;
  };
  const directSources = links.filter(link => seeds.has(link.to) && !seeds.has(link.from)).map(link => link.from);
  const directConsumers = links.filter(link => seeds.has(link.from) && !seeds.has(link.to)).map(link => link.to);
  const unique = (values: string[]) => [...new Set(values)].map(destination).filter((item): item is NodeDestination => !!item);
  return { ids, sources: unique(directSources), consumers: unique(directConsumers), ...(parameterAddress ? { parameter: parameterAddress } : {}) };
}
