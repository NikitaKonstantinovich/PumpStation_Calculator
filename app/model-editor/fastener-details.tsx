import type { Assembly, Component } from "./model";
export function FastenerDetails({component,assembly,onSelect}:{component:Component;assembly:Assembly;onSelect:(id:string)=>void}) {
  const b=component.fastener!,d=b.dimensions;
  return <section aria-label="Параметры крепежа">
    <p role="status">{b.status==="ready"?"Комплект построен":"Комплект не построен — проверьте замечания"}</p>
    <p>Крепёж следует соединённым деталям. Для изменения положения редактируйте сам узел.</p>
    <p>Отверстий: {b.count}. Пакет: {b.grip.toFixed(2)} мм. Минимальная длина: {b.minimumLength.toFixed(2)} мм.</p>
    {d&&b.hardware&&<><p>{b.hardware.rod.name} × {b.count}</p><p>{b.hardware.nut.name} × {b.count*d.ends}</p><p>{b.hardware.washer.name} × {b.count*d.ends}</p><p>М{d.diameter} × {d.length} мм. Полые гайки и шайбы; резьба и фаски упрощены.</p></>}
    {b.issues.map((s,i)=><p key={i}>{s}</p>)}
    <details><summary>Состав пакета</summary>{b.members.map(id=><p key={id}><button onClick={()=>onSelect(id)}>{assembly.components.find(c=>c.id===id)?.name??id}</button></p>)}</details>
    <details><summary>Источники размеров</summary>{b.sources.map((s,i)=><p key={i}>{s}</p>)}</details>
  </section>;
}
