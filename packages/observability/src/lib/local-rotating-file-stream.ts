import { Writable } from 'stream';
import { dirname, resolve } from 'path';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'fs';

function toAbsolutePath(pathname: string): string {
  return resolve(process.cwd(), pathname);
}

export type LocalRotatingFileStreamOptions = {
  filePath: string;
  maxBytes: number;
  maxFiles: number;
};

export class LocalRotatingFileStream extends Writable {
  private readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private currentSize: number;

  constructor(options: LocalRotatingFileStreamOptions) {
    super();
    this.filePath = toAbsolutePath(options.filePath);
    this.maxBytes = options.maxBytes;
    this.maxFiles = options.maxFiles;

    mkdirSync(dirname(this.filePath), { recursive: true });
    this.currentSize = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
  }

  override _write(
    chunk: string | Buffer,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      const buffer =
        typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk;

      if (
        this.maxBytes > 0 &&
        this.currentSize > 0 &&
        this.currentSize + buffer.byteLength > this.maxBytes
      ) {
        this.rotateFiles();
      }

      appendFileSync(this.filePath, buffer);
      this.currentSize += buffer.byteLength;
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private rotateFiles(): void {
    if (this.maxFiles > 0) {
      const oldestPath = `${this.filePath}.${this.maxFiles}`;
      if (existsSync(oldestPath)) {
        rmSync(oldestPath, { force: true });
      }

      for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
        const sourcePath = `${this.filePath}.${index}`;
        const targetPath = `${this.filePath}.${index + 1}`;
        if (existsSync(sourcePath)) {
          renameSync(sourcePath, targetPath);
        }
      }

      if (existsSync(this.filePath)) {
        renameSync(this.filePath, `${this.filePath}.1`);
      }
    } else if (existsSync(this.filePath)) {
      rmSync(this.filePath, { force: true });
    }

    this.currentSize = 0;
  }
}
