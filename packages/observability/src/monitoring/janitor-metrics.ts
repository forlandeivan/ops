/**
 * Prometheus-метрики сервиса-уборщика (janitor).
 *
 * Инкрементируются в janitor-оркестраторе на каждый enforce-прогон политики.
 * Экспонируются: в janitor-процессе — health-сервером (`/metrics`), в api-процессе
 * (ручные run-now из админки исполняются там же) — общим metrics-роутом.
 */
import { Counter, Gauge, Histogram } from 'prom-client';

import { register } from './metrics';

/** Прогоны политик уборки по статусам (label policy = resourceKey реестра, ~30 значений). */
export const janitorRunsTotal = new Counter({
  name: 'janitor_runs_total',
  help: 'Total janitor policy runs by status and trigger',
  labelNames: ['policy', 'status', 'trigger'] as const,
  registers: [register],
});

/** Удалено сущностей (строк PG / объектов S3 / коллекций Qdrant) enforce-прогонами. */
export const janitorDeletedItemsTotal = new Counter({
  name: 'janitor_deleted_items_total',
  help: 'Total items (rows/objects/collections) deleted by janitor enforce runs',
  labelNames: ['policy'] as const,
  registers: [register],
});

/** Освобождено байт в объектном хранилище (заполняется только storage-политиками). */
export const janitorFreedBytesTotal = new Counter({
  name: 'janitor_freed_bytes_total',
  help: 'Total bytes freed in object storage by janitor enforce runs',
  labelNames: ['policy'] as const,
  registers: [register],
});

/** Длительность enforce-прогона политики. */
export const janitorRunDurationSeconds = new Histogram({
  name: 'janitor_run_duration_seconds',
  help: 'Duration of janitor policy enforce runs in seconds',
  labelNames: ['policy'] as const,
  buckets: [0.1, 0.5, 1, 5, 15, 60, 300, 900],
  registers: [register],
});

/** Unix-время последнего успешного прогона политики (алерт на «уборка давно не проходила»). */
export const janitorLastSuccessTimestampSeconds = new Gauge({
  name: 'janitor_last_success_timestamp_seconds',
  help: 'Unix timestamp of the last successful janitor run per policy',
  labelNames: ['policy'] as const,
  registers: [register],
});
