"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cadContents, cadJobActive, cadReady, cadSnapshotData, digestSnapshot, type CadJob, type CadFormat, type CadManifest } from "./cad-export";
import type { DnEntity, ModelEntity, ProjectConfig, SettingsEntity, SpecEntity } from "./project-config";

async function receive(response: Response, projectId: string): Promise<CadJob | null> {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Не удалось получить результат SOLIDWORKS.");
  const job = data.job;
  if (job && (job.projectId !== projectId || !/^[a-f0-9-]{36}$/.test(job.id))) throw new Error("Получено задание другого проекта.");
  return job;
}

export const artifactUrl = (job: CadJob, format: CadFormat | "report") =>
  `/api/cad-export/${job.id}/download?format=${format}&snapshotKey=${job.snapshotKey}`;

function useBuild(project: ProjectConfig, enabled: boolean) {
  const assembly = (project.entities["station-model"] as ModelEntity)?.editor?.assembly;
  const spec = (project.entities["station-spec"] as SpecEntity)?.items;
  const stationType=(project.entities["station-settings"] as SettingsEntity)?.stationType;
  const material=(project.entities["station-dn"] as DnEntity)?.collectorMaterial;
  const snapshot = useMemo(() => {
    if (!enabled || !assembly?.components.length) return null;
    try {
      const contents = cadContents(assembly, spec, stationType, material);
      return { contents, canonical: cadSnapshotData(contents.instances) };
    } catch (e) { return { error: String(e) }; }
  }, [assembly, enabled, spec, stationType, material]);
  const canonical = snapshot?.canonical;
  const [hash, setHash] = useState<{ canonical: string; key: string }>();
  const [job, setJob] = useState<CadJob | null>(null);
  const [error, setError] = useState(""), [connectionError, setConnectionError] = useState("");
  const [loaded, setLoaded] = useState(false), [sending, setSending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const downloadRequest = useRef<{ id: string; key: string; format: CadFormat } | null>(null);
  const sequence = useRef(0), lock = useRef(false);
  const key = hash && hash.canonical === canonical ? hash.key : null;
  const projectId = project.project.id;
  useEffect(() => {
    let current = true;
    if (canonical) digestSnapshot(canonical).then(key => {
      if (current) setHash({ canonical, key });
    }).catch(() => { if (current) setError("Не удалось проверить идентификатор компоновки."); });
    return () => { current = false; };
  }, [canonical]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const version = sequence.current;
      let delay = 10000;
      try {
        const next = await receive(await fetch(`/api/cad-export?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal: controller.signal }), projectId);
        if (controller.signal.aborted) return;
        if (version === sequence.current && !lock.current) { setJob(next); setConnectionError(""); setLoaded(true); }
        if (cadJobActive(next) || Object.values(next?.artifacts ?? {}).includes("queued")) delay = 1200;
      } catch (e) {
        if (controller.signal.aborted) return;
        setConnectionError(e instanceof Error ? e.message : "Сервис SOLIDWORKS недоступен.");
      }
      timer = setTimeout(poll, delay);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled, projectId, refresh]);

  const ready = enabled && !connectionError && cadReady(job, key);
  useEffect(() => {
    const requested = downloadRequest.current;
    if (!requested) return;
    if (requested.key !== key || requested.id !== job?.id || !enabled) { downloadRequest.current = null; return; }
    const state = job.artifacts?.[requested.format];
    if (ready && state === "ready") {
      const link = document.createElement("a");
      link.href = artifactUrl(job, requested.format);
      link.download = "";
      link.click();
      downloadRequest.current = null;
    } else if (state === "failed" || job.staleReason) downloadRequest.current = null;
  }, [job, key, ready, enabled]);

  const exporting = Object.values(job?.artifacts ?? {}).includes("queued");
  const busy = sending || cadJobActive(job) || exporting;
  const submit = async (url: string, payload: unknown) => {
    lock.current = true; sequence.current++; setSending(true); setError("");
    try {
      const next = await receive(await fetch(url, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload) }), projectId);
      setJob(next);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить запрос.");
      return null;
    } finally {
      sequence.current++; lock.current = false; setSending(false); setRefresh(n => n + 1);
    }
  };
  const canBuild = enabled && loaded && !connectionError && !!key && !busy;
  const build = async () => {
    if (!canBuild || lock.current || !snapshot?.contents || !assembly) return;
    const manifest: CadManifest = { version: 1, projectId, projectName: project.project.name, projectUpdatedAt: project.project.updatedAt,
      sourceFingerprint: assembly.sourceFingerprint, coordinates: "right-handed-z-up-mm", transformConvention: "solidworks-row-axes-metres", ...snapshot.contents };
    await submit("/api/cad-export", { requestId: crypto.randomUUID(), snapshotKey: key, manifest });
  };
  const save = async (format: CadFormat) => {
    if (!ready || !job || !key || busy || lock.current) return;
    downloadRequest.current = { id: job.id, key, format };
    const next = await submit(`/api/cad-export/${job.id}/export?format=${format}&snapshotKey=${key}`, {});
    if (!next) downloadRequest.current = null;
  };
  const stale = job && (job.status === "partial" || job.status === "completed") &&
    (job.staleReason || (key && key !== job.snapshotKey) || !canonical);
  return { job, ready, busy, canBuild, build, save, error: error || connectionError || snapshot?.error,
    stage: sending ? "Передача запроса…" : exporting ? "Подготовка файла…" : stale ? "Компоновка изменилась. Повторите сборку." : job?.stage,
    stale: !!stale };
}

const CadContext = createContext<ReturnType<typeof useBuild> | null>(null);
export function CadProvider({ project, enabled, children }: { project: ProjectConfig; enabled: boolean; children: ReactNode }) {
  const state = useBuild(project, enabled);
  return <CadContext.Provider value={state}>{children}</CadContext.Provider>;
}
export function useCadBuild() {
  const state = useContext(CadContext);
  if (!state) throw new Error("Нет контекста сборки SOLIDWORKS");
  return state;
}
