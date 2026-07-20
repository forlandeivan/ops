import type {
  KnowledgeExcelImportWarning,
  KnowledgeExcelPreviewRow,
  KnowledgeExcelRangeBounds,
} from "./schema";

export interface KnowledgeExcelWorkbookSheetSummary {
  id: string;
  workbookId: string;
  sheetIndex: number;
  title: string;
  usedRange: KnowledgeExcelRangeBounds | null;
  rowCount: number;
  columnCount: number;
  cellCount: number;
  warnings: KnowledgeExcelImportWarning[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeExcelWorkbookSheetPreview extends KnowledgeExcelWorkbookSheetSummary {
  headerValues: string[];
  previewRows: KnowledgeExcelPreviewRow[];
}

export interface KnowledgeExcelWorkbookDetail {
  id: string;
  documentId: string;
  nodeId: string;
  sourceFileName: string | null;
  sourceFileHash: string | null;
  format: string;
  sheetCount: number;
  processedSheetCount: number;
  totalRowCount: number;
  maxColumnCount: number;
  totalCellCount: number;
  warnings: KnowledgeExcelImportWarning[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  sheets: KnowledgeExcelWorkbookSheetSummary[];
}

export interface GetKnowledgeExcelWorkbookResponse {
  workbook: KnowledgeExcelWorkbookDetail;
}

export interface GetKnowledgeExcelSheetPreviewResponse {
  workbookId: string;
  sheet: KnowledgeExcelWorkbookSheetPreview;
}

export interface KnowledgeExcelSheetRangeRow {
  rowIndex: number;
  values: string[];
}

export interface KnowledgeExcelSheetRangeWindow {
  requested: {
    rowOffset: number;
    rowLimit: number;
    colOffset: number;
    colLimit: number;
  };
  resolved: {
    rowOffset: number;
    rowLimit: number;
    colOffset: number;
    colLimit: number;
  };
  totalRows: number;
  totalColumns: number;
  rows: KnowledgeExcelSheetRangeRow[];
}

export interface GetKnowledgeExcelSheetRangeResponse {
  workbookId: string;
  sheet: {
    id: string;
    sheetIndex: number;
    title: string;
    usedRange: KnowledgeExcelRangeBounds | null;
    rowCount: number;
    columnCount: number;
    headerValues: string[];
    warnings: KnowledgeExcelImportWarning[];
  };
  window: KnowledgeExcelSheetRangeWindow;
}
