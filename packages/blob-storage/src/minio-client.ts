import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import {
  collectPoolStats,
  startMinioPoolMonitor,
  type MinioPoolStats,
} from "./minio-pool-monitor";
import { setMinioPoolStatsProvider } from "@unica/observability/monitoring/metrics";

const {
  MINIO_ENDPOINT = "http://localhost:9000",
  MINIO_REGION = "ru-mow",
  MINIO_ACCESS_KEY = "",
  MINIO_SECRET_KEY = "",
  MINIO_USE_SSL = "false",
  MINIO_FORCE_PATH_STYLE = "true",
  STORAGE_PUBLIC_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT,
} = process.env;

// Таймаут установления соединения с MinIO. Намеренно низкий: при недоступном
// хранилище операции должны отваливаться за секунды, а не висеть до общего
// лимита запроса (httpServer.requestTimeout = 600c). Ограничивает только сам
// коннект, поэтому не влияет на длительность загрузок/скачиваний.
const MINIO_CONNECTION_TIMEOUT_MS = Number(process.env.MINIO_CONNECTION_TIMEOUT_MS) || 3000;

// Таймаут БЕЗДЕЙСТВИЯ сокета (не общая длительность запроса). Ловит «тихо
// зависший» MinIO — коннект установлен, но байты не идут (full disk, stall,
// перегрузка): операция отваливается за секунды вместо удержания сокета/памяти
// до httpServer.requestTimeout=600c. КРИТИЧНО: это именно inactivity, а не
// round-trip (requestTimeout), поэтому НЕ рвёт живые-но-медленные потоковые
// передачи — getObject, который медленно стримится клиенту с backpressure,
// держит сокет активным и не обрывается. Загрузки буферизуются в RAM (multer
// memoryStorage), поэтому нога Node→MinIO внутренняя и быстрая.
const MINIO_SOCKET_TIMEOUT_MS = Number(process.env.MINIO_SOCKET_TIMEOUT_MS) || 60_000;

// Потолок пула HTTP-соединений к MinIO. Без явного агента @smithy/node-http-handler
// подставляет дефолт keepAlive:true + maxSockets:50 — «тихий» потолок, который никто
// не выбирал. Если тело getObject не дочитано/не уничтожено (см. server/lib/stream-utils), сокет
// числится «занятым» и не возвращается в пул → за часы пул упирается в maxSockets, и
// новые операции (headObject/putObject) падают по connectionTimeout. Делаем агент явным
// и тюнингуемым: дефолт 50 = прежнее поведение; в e2e-репро понижаем до 2.
const MINIO_AGENT_MAX_SOCKETS = Number(process.env.MINIO_AGENT_MAX_SOCKETS) || 50;
const MINIO_AGENT_MAX_FREE_SOCKETS = Number(process.env.MINIO_AGENT_MAX_FREE_SOCKETS) || 10;
const MINIO_AGENT_KEEP_ALIVE_MS = Number(process.env.MINIO_AGENT_KEEP_ALIVE_MS) || 30_000;

const agentOptions = {
  keepAlive: true,
  keepAliveMsecs: MINIO_AGENT_KEEP_ALIVE_MS,
  maxSockets: MINIO_AGENT_MAX_SOCKETS,
  maxFreeSockets: MINIO_AGENT_MAX_FREE_SOCKETS,
};
// Один пул на процесс (агенты ключуются по host:port, поэтому upload/download-клиенты
// получат раздельные подпулы автоматически).
const minioHttpAgent = new HttpAgent(agentOptions);
const minioHttpsAgent = new HttpsAgent(agentOptions);

const baseClientConfig = {
  region: MINIO_REGION,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: MINIO_FORCE_PATH_STYLE === "true",
  tls: MINIO_USE_SSL === "true",
};

const createS3Client = (endpoint: string) =>
  new S3Client({
    ...baseClientConfig,
    endpoint,
    requestHandler: new NodeHttpHandler({
      connectionTimeout: MINIO_CONNECTION_TIMEOUT_MS,
      socketTimeout: MINIO_SOCKET_TIMEOUT_MS,
      httpAgent: minioHttpAgent,
      httpsAgent: minioHttpsAgent,
    }),
  });

export const minioClient = createS3Client(MINIO_ENDPOINT);

const downloadEndpoint = (STORAGE_PUBLIC_ENDPOINT || "").trim() || MINIO_ENDPOINT;
export const downloadMinioClient = downloadEndpoint === MINIO_ENDPOINT ? minioClient : createS3Client(downloadEndpoint);

export async function minioHealthCheck() {
  await minioClient.send(new ListBucketsCommand({}));
}

/**
 * Снимок занятости пула соединений MinIO (P0.3): active/free/queued/maxSockets.
 * Ранний сигнал об исчерпании пула (до 503) + механизм ассерта для leak-регресса.
 */
export function getMinioPoolStats(): MinioPoolStats {
  return collectPoolStats([minioHttpAgent, minioHttpsAgent]);
}

// Нативный Prometheus-экспорт занятости пула (gauge minio_pool_sockets на /metrics).
setMinioPoolStatsProvider(getMinioPoolStats);

// Авто-старт лёгкого сэмплера занятости пула. Гейт: не в unit-тестах (VITEST) и не при
// MINIO_POOL_MONITOR=off. Таймер unref — graceful-shutdown не блокирует.
if (process.env.MINIO_POOL_MONITOR !== "off" && !process.env.VITEST) {
  startMinioPoolMonitor(getMinioPoolStats);
}
