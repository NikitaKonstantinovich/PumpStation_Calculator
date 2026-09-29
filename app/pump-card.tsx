import type { ReactNode } from "react";
import type { Pump } from "./pump-catalog";
import { pumpCardCurves, pumpCardPhysicalData, pumpCardSections, pumpCardValue, PUMP_TYPE_LABELS } from "./pump-card-data";

export function PumpCard({ pump, children }: { pump: Pump; children?: ReactNode }) {
  const curves = pumpCardCurves(pump);
  const physical = pumpCardPhysicalData(pump);
  return <article className="pump-card" aria-label={`Карточка насоса ${pump.manufacturer} ${pump.model}`}>
    <header className="pump-card__header">
      <span className="pump-card__eyebrow">{pump.manufacturer} · {pump.series}</span>
      <h2>{pump.model}</h2>
      <p>{PUMP_TYPE_LABELS[pump.type]} · {pump.medium === "wastewater" ? "Сточная вода" : "Чистая вода"}</p>
      <div className="pump-card__highlights">
        <span><small>Мощность, кВт</small><b>{pumpCardValue(pump.power)}</b></span>
        <span><small>Q ном., м³/ч</small><b>{pumpCardValue(pump.nominalFlow)}</b></span>
        <span><small>H ном., м</small><b>{pumpCardValue(pump.ratedHead)}</b></span>
      </div>
      <dl className="pump-card__physical">
        <div><dt>Всасывающий патрубок</dt><dd>{physical.inlet}</dd></div>
        <div><dt>Напорный патрубок</dt><dd>{physical.outlet}</dd></div>
        {physical.connectionVariants && (physical.inlet === "Не указано в базе" || physical.outlet === "Не указано в базе") && <div><dt>Присоединение по каталогу</dt><dd>{physical.connectionVariants}</dd></div>}
        <div><dt>Масса, кг</dt><dd>{physical.weight}</dd></div>
      </dl>
    </header>
    {(pump.selectable === false || pump.active === false || Boolean(pump.dataWarnings?.length)) && <aside className="pump-card__notice">
      {(pump.selectable === false || pump.active === false) && <p>Модель недоступна для подбора.</p>}
      {pump.dataWarnings?.map((warning, index) => <p key={index}>{warning}</p>)}
    </aside>}
    <div className="pump-card__characteristics">
      <p className="pump-card__hint">Характеристики одного насоса по данным каталога. «—» — значение не указано.</p>
      {pumpCardSections(pump).map(section => <section className="pump-card__section" key={section.title}>
        <h3>{section.title}</h3>
        <dl>{section.rows.map((row, index) => <div className="pump-card__row" key={`${row.label}-${index}`}>
          <dt>{row.label}</dt><dd>{row.value}</dd>
        </div>)}</dl>
      </section>)}
      {curves.length > 0 && <section className="pump-card__section">
        <h3>Точки характеристик</h3>
        {curves.map(curve => <details className="pump-card__curve" key={curve.title}>
          <summary>{curve.title}<span>Точек: {curve.points.length}</span></summary>
          <table><caption>{curve.title}</caption><thead><tr><th scope="col">Q, м³/ч</th><th scope="col">{curve.unit}</th></tr></thead>
            <tbody>{curve.points.map(([q, value], index) => <tr key={index}><td>{pumpCardValue(q)}</td><td>{pumpCardValue(value)}</td></tr>)}</tbody>
          </table>
        </details>)}
      </section>}
    </div>
    <section className="pump-card__drawing" aria-label="Эскиз с габаритами">
      <h3>Эскиз с габаритами</h3>
      {children ?? <div className="pump-sketch__empty"><span aria-hidden="true">⌁</span><b>Чертёж не найден</b><p>Для насоса {pump.manufacturer} {pump.model} в подключённых каталогах нет подтверждённого габаритного листа.</p></div>}
    </section>
  </article>;
}
