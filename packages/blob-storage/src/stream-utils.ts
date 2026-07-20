import type { Readable } from "stream";
import type { Response } from "express";

/**
 * Безопасное потребление S3/MinIO Body-стримов с гарантией возврата сокета в пул.
 *
 * Корень прод-инцидента: @smithy/node-http-handler держит сокет «занятым», пока
 * Body (Readable) не дочитан ДО конца ИЛИ не уничтожен через .destroy(). Если код
 * получает body и бросает исключение / выходит раньше / клиент обрывает соединение,
 * сокет не возвращается в пул → за часы пул упирается в maxSockets → 503.
 *
 * Все хелперы ниже гарантируют destroy() на ЛЮБОМ пути выхода. destroy() идемпотентен
 * и no-op после полного чтения, поэтому усечения успешного потока не происходит.
 */

/**
 * Вычитывает Readable в Buffer и ГАРАНТИРОВАННО уничтожает стрим в finally
 * (успех, ошибка чтения, abort внутри цикла). Канонический safe-вариант,
 * заменяющий ручные `stream.on('error', reject)` без destroy().
 */
export async function streamToBufferSafe(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | ArrayLike<number>));
    }
    return Buffer.concat(chunks);
  } finally {
    if (!stream.destroyed) {
      stream.destroy();
    }
  }
}

/**
 * Обёртка для результата getObject/getWorkspaceFile (`{ body } | null`).
 * Гарантирует destroy() body даже если исключение возникнет в «зазоре» между
 * получением объекта и потреблением. Возвращает null, если объекта/тела нет.
 */
export async function readBodyBuffer(
  obj: { body: Readable } | null | undefined,
): Promise<Buffer | null> {
  if (!obj?.body) {
    return null;
  }
  return streamToBufferSafe(obj.body);
}

/**
 * Выполняет работу над body и ГАРАНТИРОВАННО уничтожает стрим в finally.
 * Для случаев, где потребление сложнее, чем чтение в Buffer (readline, pipe, парсинг).
 * destroy() в finally закрывает «зазор получения» и ранние return/throw.
 */
export async function withBody<T>(
  body: Readable,
  use: (body: Readable) => Promise<T>,
): Promise<T> {
  try {
    return await use(body);
  } finally {
    if (!body.destroyed) {
      body.destroy();
    }
  }
}

/**
 * Пайпит Body в HTTP-ответ с leak-safe teardown: при обрыве соединения клиентом
 * (res 'close') или ошибке источника стрим уничтожается, возвращая сокет в пул.
 * Заголовки выставляет вызывающий ДО вызова. Эталон: routes/chat.routes.ts (range download).
 */
export function pipeBodyToResponse(res: Response, body: Readable): void {
  const destroyBody = () => {
    if (!body.destroyed) {
      body.destroy();
    }
  };
  res.once("close", destroyBody);
  body.once("error", () => {
    destroyBody();
    if (!res.headersSent) {
      res.status(500);
    }
    if (!res.writableEnded) {
      res.end();
    }
  });
  body.pipe(res);
}
