"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadCatalog } from "./catalog-client";
import { loadStationCatalog } from "./station-catalog";
import type { ToolContext } from "./schema";
import type { CatalogSource } from "./workspace-sources";

type Resources = NonNullable<ToolContext["resources"]>;
type CatalogRuntime = {
  baseVersions: Record<string, string>;
  sourceVersions: Record<string, string>;
  resources?: Resources;
};
type State = {
  runtime: CatalogRuntime;
  resources?: Resources;
  errors?: Partial<Record<CatalogSource, string>>;
};
const labels: Record<CatalogSource, string> = {
  pump_catalog_v2: "Каталог насосов",
  station_catalog: "Справочники комплектации"
};

export function useWorkspaceCatalogs(runtime: CatalogRuntime | null) {
  const [state, setState] = useState<State>();
  if (state && state.runtime !== runtime) setState(undefined);
  const current = state?.runtime === runtime ? state : undefined;
  const resources = useMemo(() => ({...runtime?.resources, ...current?.resources}), [runtime, current?.resources]);
  const available = useMemo(() => new Set<CatalogSource>(
    (Object.keys(resources) as CatalogSource[]).filter(source => !!resources[source])
  ), [resources]);
  const pending = useMemo(() => ({runtime, requests: new Map<CatalogSource, AbortController>()}), [runtime]);
  useEffect(() => () => {
    for (const request of pending.requests.values()) request.abort();
    pending.requests.clear();
  }, [pending]);
  const errors = current?.errors;
  const request = useCallback((source: CatalogSource, retry = false) => {
    const runtime = pending.runtime;
    const pin = runtime?.sourceVersions[source];
    if (!runtime || !pin || available.has(source) || pending.requests.has(source) || (!retry && errors?.[source])) return;

    const controller = new AbortController();
    pending.requests.set(source, controller);
    if (retry) setState(previous => previous?.runtime === runtime ?
      {...previous, errors: {...previous.errors, [source]: undefined}} : previous);
    const load: Promise<Resources> = source === "pump_catalog_v2"
      ? loadCatalog(pin, controller.signal).then(pump_catalog_v2 => ({pump_catalog_v2}))
      : loadStationCatalog(pin, runtime.baseVersions, controller.signal).then(station_catalog => ({station_catalog}));
    void load.then(loaded => {
      if (!controller.signal.aborted) setState(previous => ({
        ...(previous?.runtime === runtime ? previous : {runtime}),
        resources: {...(previous?.runtime === runtime ? previous.resources : undefined), ...loaded}
      }));
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setState(previous => ({
        ...(previous?.runtime === runtime ? previous : {runtime}),
        errors: {...(previous?.runtime === runtime ? previous.errors : undefined), [source]: error.message}
      }));
    }).finally(() => {
      if (pending.requests.get(source) === controller) pending.requests.delete(source);
    });
  }, [pending, available, errors]);
  return {resources, available, errors, request};
}

export function WorkspaceCatalogGate({catalogs, sources, versions, children}: {
  catalogs: ReturnType<typeof useWorkspaceCatalogs>;
  sources: readonly CatalogSource[];
  versions: Record<string, string>;
  children: ReactNode;
}) {
  const {available, errors, request} = catalogs;
  useEffect(() => {
    for (const source of sources) request(source);
  }, [sources, request]);
  const missing = sources.filter(source => !available.has(source));
  if (!missing.length) return children;
  return <>{missing.map(source => {
    if (!versions[source]) return <p key={source} role="alert">{labels[source]} · снимок не закреплён. Примените актуальную версию продукта.</p>;
    const error = errors?.[source];
    return error
      ? <p key={source} role="alert">{labels[source]} · {error} <button type="button" onClick={() => request(source, true)}>Повторить загрузку</button></p>
      : <p key={source} role="status">{labels[source]} · загрузка…</p>;
  })}</>;
}
