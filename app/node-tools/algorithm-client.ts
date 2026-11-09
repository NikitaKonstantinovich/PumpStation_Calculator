import type { Algorithm, AlgorithmVersion } from "./algorithm-schema";
export async function algorithmRequest<T = {algorithms:Algorithm[];id?:string}>(body?:unknown,algorithm?:string):Promise<T> {
  const response = await fetch("/api/admin/algorithms"+(algorithm?"?algorithm="+encodeURIComponent(algorithm):""),body ? {
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)
  } : {cache:"no-store"});
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? "Ошибка библиотеки алгоритмов");
  if (body) window.dispatchEvent(new Event("algorithms-changed"));
  return value;
}
export const getAlgorithmHistory = (id:string) => algorithmRequest<{versions:AlgorithmVersion[]}>(undefined,id).then(r=>r.versions);
export const versionReason = (reason:AlgorithmVersion["reason"]) => ({save:"Сохранение",restore:"Восстановление",copy:"Создание копии",create:"Создание",migration:"Перенос существующего алгоритма"})[reason];
export const versionDate = (date:string) => new Date(date.includes("T")?date:date.replace(" ","T")+"Z").toLocaleString("ru-RU");
