import { describe, expect, it } from "vitest";

import {
  computeCutoff,
  runRetentionTask,
  type RetentionStore,
} from "../../server/janitor/tasks/pg-retention-task";
import type { JanitorTaskDefinition } from "../../server/janitor/janitor-task-registry";

interface FakeRow {
  id: number;
  time: Date;
  payload: string | null;
  source?: string;
}

interface ColumnEquals {
  column: string;
  value: string;
}

function matchesEquals(row: FakeRow, equalsFilter?: ColumnEquals): boolean {
  return !equalsFilter || row.source === equalsFilter.value;
}

function makeFakeStore(rows: FakeRow[]) {
  return {
    rows,
    async countMatches({
      cutoff,
      requireNonNullAny,
      equalsFilter,
      cap,
    }: {
      cutoff: Date;
      requireNonNullAny?: string[];
      equalsFilter?: ColumnEquals;
      cap: number;
    }) {
      const matched = rows.filter(
        (row) =>
          row.time < cutoff &&
          matchesEquals(row, equalsFilter) &&
          (!requireNonNullAny || row.payload !== null),
      ).length;
      return Math.min(matched, cap);
    },
    async deleteBatch({
      cutoff,
      equalsFilter,
      batchSize,
    }: {
      cutoff: Date;
      equalsFilter?: ColumnEquals;
      batchSize: number;
    }) {
      const victims = rows
        .filter((row) => row.time < cutoff && matchesEquals(row, equalsFilter))
        .slice(0, batchSize);
      for (const victim of victims) {
        rows.splice(rows.indexOf(victim), 1);
      }
      return victims.length;
    },
    async stripBatch({
      cutoff,
      equalsFilter,
      batchSize,
    }: {
      cutoff: Date;
      equalsFilter?: ColumnEquals;
      batchSize: number;
    }) {
      const victims = rows
        .filter((row) => row.time < cutoff && matchesEquals(row, equalsFilter) && row.payload !== null)
        .slice(0, batchSize);
      for (const victim of victims) {
        victim.payload = null;
      }
      return victims.length;
    },
  } satisfies RetentionStore & { rows: FakeRow[] };
}

const stripTask: JanitorTaskDefinition = {
  key: "test.strip",
  label: "strip",
  description: "",
  category: "llm",
  action: "strip_columns",
  table: "fake",
  timeColumn: "time",
  pkColumn: "id",
  strippedColumns: ["payload"],
  equalsFilter: null,
  defaultRetentionDays: 30,
  defaultEnabled: false,
  defaultBatchSize: 10,
  intervalMinutes: 60,
  sensitive: false,
  cascadeNote: null,
};

const deleteTask: JanitorTaskDefinition = {
  ...stripTask,
  key: "test.delete",
  action: "delete_rows",
  strippedColumns: [],
};

const autosaveTask: JanitorTaskDefinition = {
  ...deleteTask,
  key: "test.autosave",
  equalsFilter: { column: "source", value: "autosave" },
};

const NOW = new Date("2026-05-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function ageDays(days: number): Date {
  return new Date(NOW.getTime() - days * DAY);
}

describe("computeCutoff", () => {
  it("subtracts retention days", () => {
    expect(computeCutoff(NOW, 30).toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("runRetentionTask dry_run", () => {
  it("counts matches without mutating data", async () => {
    const rows: FakeRow[] = [
      { id: 1, time: ageDays(40), payload: "heavy" },
      { id: 2, time: ageDays(40), payload: null }, // old but already stripped
      { id: 3, time: ageDays(5), payload: "heavy" }, // fresh
    ];
    const store = makeFakeStore(rows);

    const result = await runRetentionTask(
      stripTask,
      { action: "strip_columns", mode: "dry_run", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.matched).toBe(1); // only id=1 is old AND non-null
    expect(result.deleted).toBe(0);
    expect(store.rows).toHaveLength(3);
    expect(store.rows.find((row) => row.id === 1)?.payload).toBe("heavy");
  });
});

describe("runRetentionTask enforce strip_columns", () => {
  it("nulls heavy columns of old rows in batches, keeps the rows", async () => {
    const rows: FakeRow[] = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      time: ageDays(40),
      payload: "heavy",
    }));
    rows.push({ id: 100, time: ageDays(5), payload: "fresh" });
    const store = makeFakeStore(rows);

    const result = await runRetentionTask(
      stripTask,
      { action: "strip_columns", mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(25);
    expect(result.batches).toBe(3); // 10 + 10 + 5
    expect(store.rows).toHaveLength(26); // rows are preserved
    expect(store.rows.filter((row) => row.payload !== null && row.time < ageDays(30))).toHaveLength(0);
    expect(store.rows.find((row) => row.id === 100)?.payload).toBe("fresh");
  });
});

describe("runRetentionTask enforce delete_rows", () => {
  it("deletes old rows and respects maxBatchesPerRun cap", async () => {
    const rows: FakeRow[] = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      time: ageDays(40),
      payload: null,
    }));
    const store = makeFakeStore(rows);

    const result = await runRetentionTask(
      deleteTask,
      { action: "delete_rows", mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW, maxBatchesPerRun: 3 },
    );

    expect(result.deleted).toBe(30); // capped at 3 batches * 10
    expect(result.batches).toBe(3);
    expect(store.rows).toHaveLength(70);
  });
});

describe("runRetentionTask equalsFilter", () => {
  it("only deletes rows matching the equality filter (e.g. source=autosave)", async () => {
    const rows: FakeRow[] = [
      { id: 1, time: ageDays(40), payload: null, source: "autosave" },
      { id: 2, time: ageDays(40), payload: null, source: "autosave" },
      { id: 3, time: ageDays(40), payload: null, source: "user" }, // old but wrong source
      { id: 4, time: ageDays(5), payload: null, source: "autosave" }, // right source but fresh
    ];
    const store = makeFakeStore(rows);

    const result = await runRetentionTask(
      autosaveTask,
      { action: "delete_rows", mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.deleted).toBe(2); // only old autosave rows
    expect(store.rows.map((row) => row.id).sort()).toEqual([3, 4]);
  });

  it("counts only matching rows in dry_run", async () => {
    const rows: FakeRow[] = [
      { id: 1, time: ageDays(40), payload: null, source: "autosave" },
      { id: 2, time: ageDays(40), payload: null, source: "user" },
    ];
    const store = makeFakeStore(rows);

    const result = await runRetentionTask(
      autosaveTask,
      { action: "delete_rows", mode: "dry_run", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW },
    );

    expect(result.matched).toBe(1);
    expect(store.rows).toHaveLength(2);
  });
});

describe("runRetentionTask shouldAbort (graceful shutdown)", () => {
  it("прерывается между батчами и репортит aborted", async () => {
    const rows: FakeRow[] = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      time: ageDays(40),
      payload: null,
    }));
    const store = makeFakeStore(rows);
    let abort = false;
    const originalDeleteBatch = store.deleteBatch.bind(store);
    store.deleteBatch = async (params) => {
      const affected = await originalDeleteBatch(params);
      abort = true; // сигнал остановки приходит во время первого батча
      return affected;
    };

    const result = await runRetentionTask(
      deleteTask,
      { action: "delete_rows", mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW, shouldAbort: () => abort },
    );

    expect(result.aborted).toBe(true);
    expect(result.deleted).toBe(10); // ровно один батч, дальше не пошли
    expect(result.batches).toBe(1);
    expect(store.rows).toHaveLength(90);
  });

  it("aborted=false при штатном завершении", async () => {
    const store = makeFakeStore([{ id: 1, time: ageDays(40), payload: null }]);

    const result = await runRetentionTask(
      deleteTask,
      { action: "delete_rows", mode: "enforce", retentionDays: 30, batchSize: 10 },
      store,
      { now: NOW, shouldAbort: () => false },
    );

    expect(result.aborted).toBe(false);
    expect(result.deleted).toBe(1);
  });
});
