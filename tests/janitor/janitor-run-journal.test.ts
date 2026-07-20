import { describe, expect, it } from "vitest";

import { toJournalEntry } from "../../server/janitor/janitor-policy-service";
import { JANITOR_TASKS } from "../../server/janitor/janitor-task-registry";

const startedAt = new Date("2026-05-27T10:00:00.000Z");

function row(partial: Partial<Parameters<typeof toJournalEntry>[0]> = {}) {
  return {
    resourceKey: "pg.assistant_executions",
    status: "success",
    deletedCount: 5,
    freedBytes: 0,
    startedAt,
    triggeredBy: "auto" as string | null,
    actorFullName: null as string | null,
    actorEmail: null as string | null,
    ...partial,
  };
}

describe("toJournalEntry", () => {
  it("resolves resource_key to the registry label", () => {
    const known = JANITOR_TASKS[0];
    const entry = toJournalEntry(row({ resourceKey: known.key }));
    expect(entry.label).toBe(known.label);
  });

  it("falls back to the raw key for an unknown resource", () => {
    const entry = toJournalEntry(row({ resourceKey: "pg.does_not_exist" }));
    expect(entry.label).toBe("pg.does_not_exist");
  });

  it("marks an automatic run with no actor", () => {
    const entry = toJournalEntry(row({ triggeredBy: "auto", actorFullName: "Админ", actorEmail: "a@x.io" }));
    expect(entry.triggeredBy).toBe("auto");
    expect(entry.actorName).toBe("Админ");
  });

  it("prefers full name over email for the manual actor", () => {
    const entry = toJournalEntry(
      row({ triggeredBy: "manual", actorFullName: "Иван Фролов", actorEmail: "ivan@x.io" }),
    );
    expect(entry.triggeredBy).toBe("manual");
    expect(entry.actorName).toBe("Иван Фролов");
  });

  it("falls back to email when full name is blank", () => {
    const entry = toJournalEntry(row({ triggeredBy: "manual", actorFullName: "   ", actorEmail: "ivan@x.io" }));
    expect(entry.actorName).toBe("ivan@x.io");
  });

  it("returns null actor when neither name nor email is present", () => {
    const entry = toJournalEntry(row({ triggeredBy: "manual", actorFullName: null, actorEmail: null }));
    expect(entry.actorName).toBeNull();
  });

  it("coerces an unexpected trigger value to auto", () => {
    const entry = toJournalEntry(row({ triggeredBy: "bogus" }));
    expect(entry.triggeredBy).toBe("auto");
  });

  it("normalizes freedBytes and startedAt", () => {
    const entry = toJournalEntry(row({ freedBytes: "2048", deletedCount: 3 }));
    expect(entry.freedBytes).toBe(2048);
    expect(entry.deletedCount).toBe(3);
    expect(entry.startedAt).toBe(startedAt.toISOString());
  });
});
