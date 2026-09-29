import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { ProjectConfig, ProjectEntity } from "./project-config";

const SHARED_ENTITIES = ["system-input", "system-input-2", "station-settings"] as const;

// Detached tools use the same project data. Send changed entities only, so an
// edit in one circuit does not replace a simultaneous edit in the other.
export function useCircuitSync(config: ProjectConfig, enabled: boolean, setConfig: Dispatch<SetStateAction<ProjectConfig>>, synchronize: (project: ProjectConfig) => ProjectConfig) {
  const channel = useRef<BroadcastChannel | null>(null);
  const previous = useRef<Record<string, string>>({});
  const latest = useRef<Record<string, ProjectEntity>>({});
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") return;
    const connection = new BroadcastChannel(`pumpstation-inputs:${config.project.id}`);
    channel.current = connection;
    previous.current = {};
    connection.onmessage = event => {
      if (event.data?.type === "request") {
        connection.postMessage({type: "inputs", entities: latest.current});
        return;
      }
      if (event.data?.type !== "inputs" || !event.data.entities) return;
      const changes: Record<string, ProjectEntity> = {};
      for (const id of SHARED_ENTITIES) {
        const entity = event.data.entities[id];
        if (!entity || entity.kind !== (id === "station-settings" ? "settings" : "input")) continue;
        const serialized = JSON.stringify(entity);
        if (previous.current[id] === serialized) continue;
        previous.current[id] = serialized;
        latest.current[id] = entity;
        changes[id] = entity;
      }
      if (Object.keys(changes).length) setConfig(current => synchronize({...current, entities: {...current.entities, ...changes}}));
    };
    connection.postMessage({type: "request"});
    return () => { connection.close(); channel.current = null; };
  }, [config.project.id, enabled, setConfig, synchronize]);
  useEffect(() => {
    const changes: Record<string, ProjectEntity> = {};
    for (const id of SHARED_ENTITIES) {
      const entity = config.entities[id], serialized = JSON.stringify(entity);
      if (previous.current[id] !== undefined && previous.current[id] !== serialized) changes[id] = entity;
      previous.current[id] = serialized;
      latest.current[id] = entity;
    }
    if (Object.keys(changes).length) channel.current?.postMessage({type: "inputs", entities: changes});
  }, [config.entities, config.project.id, enabled]);
}
