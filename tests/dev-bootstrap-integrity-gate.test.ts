import assert from "node:assert/strict";
import test from "node:test";

const { bootstrap, cleanBaseUrl, getFreellmApiDir } =
  await import("../src/dev-bootstrap.js");

test("bootstrap normalizes the FreeLLMAPI base URL", () => {
  assert.equal(
    cleanBaseUrl("http://127.0.0.1:3001/"),
    "http://127.0.0.1:3001"
  );

  assert.equal(
    cleanBaseUrl("http://127.0.0.1:3001/v1/"),
    "http://127.0.0.1:3001"
  );
});

test("bootstrap preserves an explicitly supplied API key", async () => {
  const originalBaseUrl = process.env.FRELLM_BASE_URL;
  const originalApiKey = process.env.FRELLM_API_KEY;
  const originalFetch = globalThis.fetch;

  try {
    process.env.FRELLM_BASE_URL = "http://bootstrap-test.invalid";
    process.env.FRELLM_API_KEY = "test-explicit-key";

    let receivedAuthorization = "";

    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      receivedAuthorization = String(
        (init?.headers as Record<string, string> | undefined)
          ?.Authorization ?? ""
      );

      assert.equal(
        String(input),
        "http://bootstrap-test.invalid/v1/models"
      );

      return new Response(
        JSON.stringify({ data: [{ id: "test-model" }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    };

    await bootstrap();

    assert.equal(receivedAuthorization, "Bearer test-explicit-key");
    assert.equal(process.env.FRELLM_API_KEY, "test-explicit-key");
    assert.equal(
      process.env.FRELLM_BASE_URL,
      "http://bootstrap-test.invalid"
    );
  } finally {
    if (originalBaseUrl === undefined) {
      delete process.env.FRELLM_BASE_URL;
    } else {
      process.env.FRELLM_BASE_URL = originalBaseUrl;
    }

    if (originalApiKey === undefined) {
      delete process.env.FRELLM_API_KEY;
    } else {
      process.env.FRELLM_API_KEY = originalApiKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test("default FreeLLMAPI directory is the user's freellmapi directory", () => {
  const originalDir = process.env.FRELLMAPI_DIR;

  try {
    delete process.env.FRELLMAPI_DIR;

    assert.equal(
      getFreellmApiDir(),
      `${process.env.HOME}/freellmapi`
    );
  } finally {
    if (originalDir === undefined) {
      delete process.env.FRELLMAPI_DIR;
    } else {
      process.env.FRELLMAPI_DIR = originalDir;
    }
  }
});

test("bootstrap rejects an unsuccessful FreeLLMAPI health check", async () => {
  const originalBaseUrl = process.env.FRELLM_BASE_URL;
  const originalApiKey = process.env.FRELLM_API_KEY;
  const originalFetch = globalThis.fetch;

  try {
    process.env.FRELLM_BASE_URL = "http://bootstrap-test.invalid";
    process.env.FRELLM_API_KEY = "test-explicit-key";

    globalThis.fetch = async (): Promise<Response> =>
      new Response("unauthorized", { status: 401 });

    await assert.rejects(
      () => bootstrap(),
      /FreeLLMAPI health check failed: HTTP 401/
    );
  } finally {
    if (originalBaseUrl === undefined) {
      delete process.env.FRELLM_BASE_URL;
    } else {
      process.env.FRELLM_BASE_URL = originalBaseUrl;
    }

    if (originalApiKey === undefined) {
      delete process.env.FRELLM_API_KEY;
    } else {
      process.env.FRELLM_API_KEY = originalApiKey;
    }

    globalThis.fetch = originalFetch;
  }
});

test("bootstrap rejects an invalid models response", async () => {
  const originalBaseUrl = process.env.FRELLM_BASE_URL;
  const originalApiKey = process.env.FRELLM_API_KEY;
  const originalFetch = globalThis.fetch;

  try {
    process.env.FRELLM_BASE_URL = "http://bootstrap-test.invalid";
    process.env.FRELLM_API_KEY = "test-explicit-key";

    globalThis.fetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({ invalid: true }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );

    await assert.rejects(
      () => bootstrap(),
      /invalid \/v1\/models response/
    );
  } finally {
    if (originalBaseUrl === undefined) {
      delete process.env.FRELLM_BASE_URL;
    } else {
      process.env.FRELLM_BASE_URL = originalBaseUrl;
    }

    if (originalApiKey === undefined) {
      delete process.env.FRELLM_API_KEY;
    } else {
      process.env.FRELLM_API_KEY = originalApiKey;
    }

    globalThis.fetch = originalFetch;
  }
});
