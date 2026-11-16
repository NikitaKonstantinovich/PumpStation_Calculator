export type HydraulicPort = {
  id: string;
  side: "suction" | "discharge";
  section: string;
  dn: number;
  pn: number;
  connection: "threaded" | "flanged";
};
export type HydraulicPortUse = {
  portId: string;
  owner: string;
  purpose: "equipment" | "network" | "closure";
  dn: number;
  pn: number;
  connection: HydraulicPort["connection"];
};
export type HydraulicPortEntry = {
  port: HydraulicPort;
  uses: HydraulicPortUse[];
  status: "occupied" | "closed" | "open" | "conflict";
  findings: string[];
};

/** Physical connections have one owner. A tee/manifold must expose its own
 * separate ports; it cannot be represented by assigning multiple users here. */
export function hydraulicPortLedger(ports: HydraulicPort[], uses: HydraulicPortUse[]) {
  const findings: string[] = [];
  const entries: HydraulicPortEntry[] = ports.map(port => {
    const assigned = uses.filter(use => use.portId === port.id), errors: string[] = [];
    if (!port.id || ports.filter(other => other.id === port.id).length !== 1) errors.push(`Повторный или пустой идентификатор подключения: ${port.id || "не задан"}.`);
    if (!Number.isInteger(port.dn) || port.dn <= 0 || !Number.isFinite(port.pn) || port.pn <= 0) errors.push(`${port.id}: DN/PN подключения не определены.`);
    if (assigned.length > 1) errors.push(`${port.id}: одно подключение занято несколькими узлами (${assigned.map(use => use.owner).join(", ")}). Нужен отдельный распределительный узел.`);
    for (const use of assigned) {
      if (!use.owner) errors.push(`${port.id}: не указан владелец подключения.`);
      if (use.dn !== port.dn || use.pn !== port.pn || use.connection !== port.connection) errors.push(`${port.id}: параметры подключения узла ${use.owner} не совпадают с отводом; переходный узел должен быть рассчитан отдельно.`);
    }
    const status = errors.length ? "conflict" : !assigned.length ? "open" : assigned[0].purpose === "closure" ? "closed" : "occupied";
    if (status === "open") errors.push(`${port.id}: свободное подключение не закрыто и не назначено внешней сети.`);
    return { port, uses: assigned, status, findings: errors };
  });
  for (const use of uses) if (!ports.some(port => port.id === use.portId)) findings.push(`Узел ${use.owner}: подключение ${use.portId} отсутствует в схеме.`);
  findings.push(...entries.flatMap(entry => entry.findings));
  return { entries, findings: [...new Set(findings)], complete: findings.length === 0 };
}

export type CollectorInstrumentPort = { id: string; dn: number; state: "occupied" | "capped" | "open"; lengthMm?:number; threaded?:boolean; threadPitchMm?:number; threadLengthMm?:number };
export function collectorInstrumentPortErrors(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 32) return ["Список отводов КИП должен содержать не более 32 подключений."];
  const ids = new Set<string>(), errors: string[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") { errors.push("Некорректное описание отвода КИП."); continue; }
    const port = value as Partial<CollectorInstrumentPort>;
    if (typeof port.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(port.id) || ids.has(port.id)) errors.push("Отводы КИП должны иметь уникальные идентификаторы из латинских букв, цифр и дефиса.");
    else ids.add(port.id);
    if (![15, 20, 25, 32, 40, 50].includes(port.dn ?? 0)) errors.push(`Отвод ${port.id ?? "?"}: неподдерживаемый DN резьбового сгона.`);
    if (!["occupied", "capped", "open"].includes(port.state ?? "")) errors.push(`Отвод ${port.id ?? "?"}: не определено состояние подключения.`);
    if(port.lengthMm!==undefined&&(!Number.isFinite(port.lengthMm)||port.lengthMm<=0||port.lengthMm>1000)||port.threaded!==undefined&&typeof port.threaded!=="boolean"
      ||port.threadPitchMm!==undefined&&(!Number.isFinite(port.threadPitchMm)||port.threadPitchMm<=0||port.threadPitchMm>10)
      ||port.threadLengthMm!==undefined&&(!Number.isFinite(port.threadLengthMm)||port.threadLengthMm<=0||port.threadLengthMm>=(port.lengthMm??60)))errors.push(`Отвод ${port.id??"?"}: некорректная длина или параметры резьбы.`);
  }
  return [...new Set(errors)];
}
export const collectorInstrumentPortIdentity = (ports: CollectorInstrumentPort[]) => JSON.stringify([...ports].sort((a, b) => a.id.localeCompare(b.id)).map(port => {
  const dimensions={...(port.lengthMm!==undefined&&port.lengthMm!==60?{lengthMm:port.lengthMm}:{}),...(port.threaded===false?{threaded:false}:{}),...(port.threadPitchMm!==undefined?{threadPitchMm:port.threadPitchMm}:{}),...(port.threadLengthMm!==undefined?{threadLengthMm:port.threadLengthMm}:{})};
  return [port.id,port.dn,port.state,...(Object.keys(dimensions).length?[dimensions]:[])];
}));
