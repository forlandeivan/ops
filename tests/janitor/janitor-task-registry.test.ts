import { describe, expect, it } from "vitest";

import { JANITOR_TASKS, getJanitorTask, operationsOf } from "../../server/janitor/janitor-task-registry";
import { cleanupActions, cleanupCategories } from "@shared/cleanup-policies";

describe("janitor task registry", () => {
  it("has at least one task and unique keys", () => {
    expect(JANITOR_TASKS.length).toBeGreaterThan(0);
    const keys = JANITOR_TASKS.map((task) => task.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every task and its operations are well-formed", () => {
    for (const task of JANITOR_TASKS) {
      expect(cleanupCategories).toContain(task.category);
      expect(task.defaultRetentionDays).toBeGreaterThan(0);
      expect(task.defaultBatchSize).toBeGreaterThan(0);
      expect(task.intervalMinutes).toBeGreaterThan(0);
      for (const op of operationsOf(task)) {
        expect(op.table.length).toBeGreaterThan(0);
        expect(op.timeColumn.length).toBeGreaterThan(0);
        expect(op.pkColumn.length).toBeGreaterThan(0);
        expect(cleanupActions).toContain(op.action);
        if (op.action === "strip_columns") {
          expect(op.strippedColumns.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("enables exactly the absorbed-job + agent-journal policies by default; other new coverage stays off", () => {
    const enabled = JANITOR_TASKS.filter((task) => task.defaultEnabled).map((task) => task.key).sort();
    expect(enabled).toEqual(
      [
        // поглощённые legacy-джобы — сохраняют прежнее поведение (уже чистили до janitor)
        "pg.assistant_executions",
        "pg.document_revisions.autosave",
        "pg.system_notification_logs",
        "s3.chat_attachments.drafts",
        // журнал запусков агента (eec6aabb): новые таблицы, но включены по умолчанию намеренно —
        // debug-трейс содержит тексты документов пользователей (strip через 7д = privacy-by-default),
        // а строки запуска удаляются через 90д, чтобы журнал не рос неограниченно. summary-логи
        // (pg.agent_execution_events.logs) оставлены opt-in.
        "pg.agent_execution_events.debug_payloads",
        "pg.agent_executions",
      ].sort(),
    );
    // примеры нового покрытия — выключены по умолчанию
    expect(getJanitorTask("pg.asr_executions.logs")?.defaultEnabled).toBe(false);
    expect(getJanitorTask("pg.mcp_execution_logs")?.defaultEnabled).toBe(false);
    expect(getJanitorTask("pg.chat_sessions")?.defaultEnabled).toBe(false);
    // новые storage-политики по типу — выключены (opt-in)
    expect(getJanitorTask("s3.chat_attachments.audio_video")?.defaultEnabled).toBe(false);
    expect(getJanitorTask("s3.chat_attachments.other")?.defaultEnabled).toBe(false);
  });

  it("exposes exactly two policies per heavy domain (logs + run rows)", () => {
    const byCategory = (category: string) => JANITOR_TASKS.filter((task) => task.category === category);
    expect(byCategory("llm")).toHaveLength(2);
    expect(byCategory("asr")).toHaveLength(2);
  });

  it("merges both ASR log locations into a single log policy", () => {
    const asrLogs = getJanitorTask("pg.asr_executions.logs");
    expect(asrLogs?.action).toBe("strip_columns");
    expect(asrLogs?.strippedColumns).toEqual(["pipeline_events"]);
    const tables = operationsOf(asrLogs!).map((op) => op.table);
    expect(tables).toEqual(["asr_executions", "asr_execution_events"]);
  });

  it("ships the LLM log-stripping policy", () => {
    const llm = getJanitorTask("pg.assistant_execution_steps.payloads");
    expect(llm?.action).toBe("strip_columns");
    expect(llm?.strippedColumns).toContain("input_payload");
  });

  it("splits run-row deletion into separate, sensitive, cascade-aware policies", () => {
    const llmRows = getJanitorTask("pg.assistant_executions");
    const asrRows = getJanitorTask("pg.asr_executions");
    for (const policy of [llmRows, asrRows]) {
      expect(policy?.action).toBe("delete_rows");
      expect(policy?.sensitive).toBe(true);
      expect(policy?.cascadeNote).toBeTruthy();
    }
  });

  it("scopes autosave revision cleanup with an equality filter", () => {
    const autosave = getJanitorTask("pg.document_revisions.autosave");
    expect(autosave?.action).toBe("delete_rows");
    expect(autosave?.equalsFilter).toEqual({ column: "source", value: "autosave" });
  });

  it("covers knowledge-base indexing history (knowledge category, disabled by default)", () => {
    const history = getJanitorTask("pg.knowledge_base_indexing_actions");
    expect(history?.category).toBe("knowledge");
    expect(history?.action).toBe("delete_rows");
    expect(history?.timeColumn).toBe("created_at");
    expect(history?.defaultEnabled).toBe(false);
    expect(getJanitorTask("pg.knowledge_base_indexing_jobs")).toBeUndefined();
  });

  it("registers the Qdrant orphaned-collections GC policy (vector category, opt-in, sensitive)", () => {
    const gc = getJanitorTask("qdrant.orphaned_collections");
    expect(gc?.storage).toBe("qdrant");
    expect(gc?.category).toBe("vector");
    expect(gc?.action).toBe("delete_collection");
    expect(gc?.defaultEnabled).toBe(false);
    expect(gc?.sensitive).toBe(true);
    expect(gc?.defaultRetentionDays).toBeGreaterThan(0);
    expect(cleanupCategories).toContain("vector");
    expect(cleanupActions).toContain("delete_collection");
  });

  it("groups assistant/chat purges under the 'assistants' category", () => {
    expect(cleanupCategories).toContain("assistants");
    const keys = JANITOR_TASKS.filter((task) => task.category === "assistants")
      .map((task) => task.key)
      .sort();
    expect(keys).toEqual(["pg.assistants.archived", "pg.chat_sessions"]);
  });

  it("registers archived-assistant purge (assistants category, opt-in, sensitive, status-filtered)", () => {
    const archived = getJanitorTask("pg.assistants.archived");
    expect(archived?.category).toBe("assistants");
    expect(archived?.action).toBe("delete_rows");
    expect(archived?.table).toBe("assistants");
    expect(archived?.timeColumn).toBe("updated_at");
    expect(archived?.equalsFilter).toEqual({ column: "status", value: "archived" });
    expect(archived?.defaultEnabled).toBe(false);
    expect(archived?.sensitive).toBe(true);
    expect(archived?.cascadeNote).toBeTruthy();
  });

  it("cleans expired tokens and sessions in a single policy with correct keys", () => {
    const policy = getJanitorTask("pg.expired_tokens_sessions");
    expect(policy?.category).toBe("tokens");
    const ops = operationsOf(policy!);
    expect(ops.map((op) => op.table)).toEqual([
      "email_confirmation_tokens",
      "password_reset_tokens",
      "session",
    ]);
    const sessionOp = ops.find((op) => op.table === "session");
    expect(sessionOp?.pkColumn).toBe("sid");
    expect(sessionOp?.timeColumn).toBe("expire");
    expect(getJanitorTask("pg.session")).toBeUndefined();
  });
});
