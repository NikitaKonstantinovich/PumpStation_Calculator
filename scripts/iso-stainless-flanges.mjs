import { mergeSupplierFlanges } from "./supplier-flanges.mjs";

/** ISO pipe seats supplement the metric GOST series; neither series replaces the other. */
export function mergeIsoStainlessFlanges(input, reference) {
  const data = mergeSupplierFlanges(input, reference);
  for (const row of reference.rows) {
    const item = data.items.find(item => item.id === row.id);
    for (const [column, label, value] of [
      ["article", "Артикул", row.article], ["manufacturer", "Производитель", row.manufacturer],
      ["unit", "Единица измерения", "шт."], ["weight", "Масса по каталогу, кг", row.weightKg],
      ["standard", "Стандарт по карточке", row.standard], ["facing", "Уплотнительная поверхность", "A / FF, плоская, без выступа"],
      ["fitPipeOuter", "Наружный диаметр трубы для проверки посадки, мм", row.requiredPipeOuterDiameterMm],
      ["originalPrice", "Исходная цена, EUR/шт. без НДС", row.originalPriceEur],
      ["fxRate", "Курс EUR/RUB", reference.exchangeRate.rubPerEur], ["fxDate", "Дата курса", reference.exchangeRate.date],
      ["fxSource", "Источник курса", reference.exchangeRate.url], ["priceSource", "Источник цены", row.url],
      ["priceNote", "Примечание к цене", row.priceNote], ["checkedAt", "Дата проверки источника", reference.checkedAt],
      ["documentUrl", "Паспорт URL", reference.dimensionUrl], ["materialGrade", "Марка стали EN", "1.4306 / F304L, EN10222-5"],
      ["manufacturing", "Изготовление", "Кованая нержавеющая сталь"], ["medium", "Рабочая среда", "Жидкости и газы"],
      ["maxTemperature", "Максимальная температура, °C", 450],
      ["pressureTemperature", "Давление / температура по серии 2PAS", "PN16: 20°C — 16 бар; 100°C — 13,7; 150°C — 12,3; 200°C — 11,2; 250°C — 10,4; 300°C — 9,6; 350°C — 9,2; 400°C — 8,8; 450°C — 8,5. Технический лист, стр. 2, группа 10E0."],
      ["modelStatus", "Статус 3D", "Параметрическая модель EN1092-1 тип 01/A по проверенным размерам; не STEP изготовителя"],
    ]) item.fields.push({ column, headerPath: [label], value });
    item.sourceUrls = [...new Set([row.url, reference.dimensionUrl, reference.technicalUrl, reference.exchangeRate.url])];
  }
  const table = data.catalogs.find(c => c.id === "фланцы").tables.find(t => t.id === reference.id);
  table.columns = data.items.find(i => i.tableId === reference.id).fields.map(({ column, headerPath }) => ({ column, headerPath }));
  table.sourceUrls = [...new Set(data.items.filter(i => i.tableId === reference.id).flatMap(i => i.sourceUrls))];
  return data;
}
