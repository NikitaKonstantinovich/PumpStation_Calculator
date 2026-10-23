import type { SpecItem, SpecSection } from "./project-config";
import { specificationItemPresentation, specificationSection } from "./specification-presentation";

export type SpecificationExportFormat = "csv" | "xlsx";
type SpecificationGroup = { title: string; sections: { id: SpecSection; title?: string }[] };
type ExportCell = string | number | null;
export type SpecificationExportRow = {
  kind: "header" | "group" | "subgroup" | "item" | "total";
  cells: ExportCell[];
};

const hasPrice = (item: SpecItem) => typeof item.price === "number" && Number.isFinite(item.price);
const subtotal = (items: SpecItem[]) => items.reduce((sum, item) => sum + (hasPrice(item) ? item.price! * item.quantity : 0), 0);
const partialTotalNote = (items: SpecItem[]) => items.some(item => !hasPrice(item)) ? "По заполненным ценам" : "";

// The caller supplies the displayed rows, including current pump prices and tank volume.
export function specificationExportRows(items: SpecItem[], groups: SpecificationGroup[]): SpecificationExportRow[] {
  const rows: SpecificationExportRow[] = [{ kind: "header", cells: ["№", "Наименование", "Кол-во", "Ед.", "Цена, ₽", "Сумма, ₽", "Описание", "Примечание"] }];
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
          hasPrice(item) ? item.price! : null, hasPrice(item) ? item.price! * item.quantity : null,
          presentation.description, presentation.hasWarning ? presentation.warningText : ""] });
      }
    }
  }
  rows.push({ kind: "total", cells: [null, "Итоговая стоимость", null, null, null, subtotal(items), null, partialTotalNote(items)] });
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
