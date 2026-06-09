import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const LOCK_RETRY_INTERVAL_MS = 25;
const LOCK_MAX_WAIT_MS = 5_000;

export async function atomicWrite(targetPath: string, content: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  const fh = await open(tmp, "w");
  try {
    await fh.writeFile(content, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, targetPath);
}

export async function withFileLock<T>(
  targetPath: string,
  fn: () => Promise<T>,
  options?: { maxWaitMs?: number },
): Promise<T> {
  const lockPath = `${targetPath}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + (options?.maxWaitMs ?? LOCK_MAX_WAIT_MS);
  let fh;
  while (true) {
    try {
      fh = await open(lockPath, "wx");
      break;
    } catch (err) {
      if (!isEEXIST(err)) throw err;
      if (Date.now() > deadline) {
        throw new Error(`memory-store: lock timeout for ${targetPath}`);
      }
      await sleep(LOCK_RETRY_INTERVAL_MS);
    }
  }
  try {
    await fh.writeFile(String(process.pid), "utf8");
    await fh.close();
    return await fn();
  } finally {
    try {
      await unlink(lockPath);
    } catch {
      // best-effort
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isEEXIST(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "EEXIST"
  );
}
