/**
 * Конвенция именования бакетов объектного хранилища — общий контракт.
 *
 * Живёт в shared/, потому что имя бакета выводят НЕСКОЛЬКО рантаймов: монолит
 * (создание/чтение/запись файлов пространства) и janitor-сервис `unica-ops`
 * (скан осиротевших объектов, когда `workspaces.storage_bucket` пуст у старых строк).
 * Расхождение реализаций = скан не того бакета, поэтому источник один.
 *
 * Префикс задаётся `WORKSPACE_BUCKET_PREFIX` (дефолт `ws-`) и ДОЛЖЕН совпадать
 * во всех сервисах инсталляции.
 */

export function workspaceBucketPrefix(): string {
  return (process.env.WORKSPACE_BUCKET_PREFIX || "ws-").trim();
}

/** Имя бакета пространства: префикс + нормализованный workspaceId. */
export function workspaceBucketName(workspaceId: string): string {
  const normalized = workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${workspaceBucketPrefix()}${normalized}`;
}
