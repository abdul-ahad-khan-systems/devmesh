import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_FRELLM_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_FRELLMAPI_DIR = path.join(os.homedir(), "freellmapi");

export function cleanBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

export function getFreellmApiDir(): string {
  const configured = process.env.FRELLMAPI_DIR?.trim();
  return configured ? path.resolve(configured) : DEFAULT_FRELLMAPI_DIR;
}

export async function readUnifiedApiKey(
  freellmApiDir: string
): Promise<string> {
  const dbModule = path.join(
    freellmApiDir,
    "server",
    "src",
    "db",
    "index.ts"
  );

  try {
    const imported = await import(pathToFileURL(dbModule).href) as {
      initDb: (dbPath?: string) => unknown;
      getUnifiedApiKey: () => string;
    };

    const dbPath = path.join(
      freellmApiDir,
      "server",
      "data",
      "freeapi.db"
    );

    imported.initDb(dbPath);

    const key = imported.getUnifiedApiKey()?.trim();

    if (!key) {
      throw new Error("FreeLLMAPI unified API key is empty.");
    }

    return key;
  } catch (error) {
    throw new Error(
      `Unable to load the FreeLLMAPI unified API key from ${freellmApiDir}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function verifyFreeLLMAPI(
  baseUrl: string,
  apiKey: string
): Promise<void> {
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `FreeLLMAPI health check failed: HTTP ${response.status}.`
    );
  }

  const body = await response.json() as {
    data?: unknown;
  };

  if (!Array.isArray(body.data)) {
    throw new Error(
      "FreeLLMAPI health check returned an invalid /v1/models response."
    );
  }
}

export async function bootstrap(): Promise<void> {
  const baseUrl = cleanBaseUrl(
    process.env.FRELLM_BASE_URL?.trim() || DEFAULT_FRELLM_BASE_URL
  );

  let apiKey = process.env.FRELLM_API_KEY?.trim();

  if (!apiKey) {
    const freellmApiDir = getFreellmApiDir();
    apiKey = await readUnifiedApiKey(freellmApiDir);
    process.env.FRELLM_API_KEY = apiKey;
  }

  process.env.FRELLM_BASE_URL = baseUrl;

  await verifyFreeLLMAPI(baseUrl, apiKey);

  console.log(
    `[DevMesh] FreeLLMAPI bootstrap ready: ${baseUrl}`
  );
}

export async function startDevMesh(): Promise<void> {
  await bootstrap();
  await import("./cli.js");
}

const entryPath = process.argv[1];

if (
  entryPath &&
  import.meta.url === pathToFileURL(path.resolve(entryPath)).href
) {
  try {
    await startDevMesh();
  } catch (error) {
    console.error(
      "[DevMesh] Startup bootstrap failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  }
}
