import { hydraulicAssemblyDescription } from "./hydraulic-option-assembly";
import type { SpecItem, SpecSection } from "./project-config";
import { specificationItemPresentation, specificationSection } from "./specification-presentation";
import { specificationHasPrice as hasPrice, specificationLineTotal, type SpecificationReadiness } from "./specification-readiness";

export type SpecificationExportFormat = "csv" | "xlsx";
type SpecificationGroup = { title: string; sections: { id: SpecSection; title?: string }[] };
type ExportCell = string | number | null;
export type SpecificationExportRow = {
  kind: "header" | "group" | "subgroup" | "item" | "total" | "status";
  cells: ExportCell[];
};

const subtotal = (items: SpecItem[]) => items.reduce((sum, item) => sum + specificationLineTotal(item), 0);
const partialTotalNote = (items: SpecItem[]) => items.some(item => !hasPrice(item)) ? "По заполненным ценам" : "";

// The caller supplies the displayed rows, including current pump prices and tank volume.
export function specificationExportRows(items: SpecItem[], groups: SpecificationGroup[], readiness?: SpecificationReadiness): SpecificationExportRow[] {
  const rows: SpecificationExportRow[] = [{ kind: "header", cells: ["№", "Наименование", "Кол-во", "Ед.", "Цена, ₽", "Сумма, ₽", "Описание", "Примечание"] }];
  if (readiness) {
    rows.push({ kind: "status", cells: [null, readiness.ready ? "Спецификация готова" : "Черновик — спецификация не завершена", null, null, null, null,
      `Состав: ${readiness.compositionComplete ? "полный" : "не завершён"}; техническая проверка: ${readiness.technicalReady ? "пройдена" : "не завершена"}; стоимость: ${readiness.costComplete ? "полная" : "неполная"}`, null] });
    for (const finding of readiness.findings) rows.push({ kind: "status", cells: [null, ({ composition: "Состав", technical: "Техническая проверка", price: "Стоимость" })[finding.category], null, null, null, null, null, finding.message] });
  }
  const sectionRow = (title: string, members: SpecItem[], kind: "group" | "subgroup"): SpecificationExportRow => ({
    kind, cells: [null, title, null, null, null, subtotal(members), `${members.length} поз.`, partialTotalNote(members)],
  });
  for (const group of groups) {
    const groupItems = items.filter(item => group.sections.some(section => section.id === specificationSection(item)));
    rows.push(sectionRow(group.title, groupItems, "group"));
    for (const section of group.sections) {
      const members = groupItems.filter(item => specificationSection(item) === section.id);
      if (section.title) rows.push(sectionRow(section.title, members, "subgroup"));
      for (const item of members) {
        const presentation = specificationItemPresentation(item);
        rows.push({ kind: "item", cells: [item.position, item.name, item.quantity, item.unit ?? "шт.",
          hasPrice(item) ? item.price! : null, hasPrice(item) && item.quantity > 0 ? specificationLineTotal(item) : null,
          presentation.description + (item.hydraulicAssembly ? `\n${hydraulicAssemblyDescription(item.hydraulicAssembly)}` : "") + (item.insertionAssembly ? `\nИсточник вставки: ${item.insertionAssembly.snapshot.id}; ревизия ${item.insertionAssembly.snapshot.revision}; версия каталога ${item.insertionAssembly.snapshot.catalogVersion}.\nВложенный состав на 1 изделие (включён в цену, не суммируется повторно):\n${item.insertionAssembly.snapshot.calculation.bom.map(part => `${part.role}: ${part.name}; ${part.quantity ?? "?"} ${part.unit}; стоимость ${part.cost ?? "не подтверждена"}; ${part.source ?? "нет источника"}`).join("\n")}` : ""), presentation.hasWarning ? presentation.warningText : ""] });
      }
    }
  }
  rows.push({ kind: "total", cells: [null, readiness && !readiness.costComplete ? "Известная часть стоимости" : "Итоговая стоимость", null, null, null, subtotal(items), null,
    readiness && !readiness.costComplete ? "Стоимость станции неполная; см. незавершённые узлы и цены." : partialTotalNote(items)] });
  return rows;
}

export function specificationCsv(rows: SpecificationExportRow[]): string {
  const cell = (value: ExportCell) => {
    if (value === null) return "";
    if (typeof value === "number") return String(value).replace(".", ",");
    // Quoting alone does not stop spreadsheet applications from executing formulas.
    const safe = /^[\s\uFEFF]*[=+@-]/u.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + rows.map(row => row.cells.map(cell).join(";")).join("\r\n") + "\r\n";
}

export async function specificationXlsx(rows: SpecificationExportRow[]): Promise<Blob> {
  // Load the XLSX writer only when this format is requested.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pump Station Calculator";
  const sheet = workbook.addWorksheet("Спецификация", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  sheet.columns = [10, 48, 12, 10, 18, 20, 56, 64].map(width => ({ width }));
  sheet.getColumn(5).numFmt = '#,##0.00';
  sheet.getColumn(6).numFmt = '#,##0.00';
  sheet.pageSetup.printTitlesRow = "1:1";
  for (const source of rows) {
    const row = sheet.addRow(source.cells);
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "top", wrapText: true, horizontal: column >= 3 && column <= 6 ? "right" : "left" };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDCE3E8" } } };
      if (source.kind !== "item") {
        const header = source.kind === "header";
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: header ? "FFFFFFFF" : "FF273B49" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: header ? "FF234A62" : source.kind === "subgroup" ? "FFF7F9FA" : "FFE7EFF5" } };
      }
    });
    if (source.kind === "header") row.height = 30;
    // Position identifiers must remain text, including leading zeroes and dots.
    if (source.kind === "item") row.getCell(1).numFmt = "@";
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function specificationExportBlob(rows: SpecificationExportRow[], format: SpecificationExportFormat): Promise<Blob> {
  return format === "csv" ? new Blob([specificationCsv(rows)], { type: "text/csv;charset=utf-8" }) : specificationXlsx(rows);
}
