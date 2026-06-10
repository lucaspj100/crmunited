import * as XLSX from "xlsx";

export function exportRowsToXlsx(rows: (string | number | null | undefined)[][], headers: string[], filename: string, sheetName = "Dados") {
  const aoa = [headers, ...rows.map((r) => r.map((v) => (v == null ? "" : v)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
