const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createServer } = require("../server");

async function withServer(options, run) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "personal-ai-test-"));
  const server = createServer({ dataDir, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function jsonRequest(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  return { response, body: await response.json() };
}

test("conversations persist, files are searchable, and retrieved context reaches the model", async () => {
  let providerRequest;
  await withServer({
    env: { OPENAI_API_KEY: "test-key", OPENAI_MODEL: "test-model" },
    fetchImpl: async (url, options) => {
      providerRequest = { url, options };
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Your notes say to plan a garden." } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }, async (baseUrl) => {
    const created = await jsonRequest(baseUrl, "/api/conversations", { method: "POST", body: "{}" });
    assert.equal(created.response.status, 201);
    const id = created.body.id;
    const uploaded = await jsonRequest(baseUrl, "/api/files", {
      method: "POST",
      body: JSON.stringify({ name: "garden.md", content: "My garden plan includes tomatoes and basil." })
    });
    assert.equal(uploaded.response.status, 201);
    const search = await jsonRequest(baseUrl, "/api/search?q=tomatoes%20garden");
    assert.equal(search.body.results[0].name, "garden.md");

    await jsonRequest(baseUrl, "/api/settings", {
      method: "PUT",
      body: JSON.stringify({ instructions: "Keep it practical." })
    });
    const sent = await jsonRequest(baseUrl, `/api/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "What should I plant in my garden?" })
    });
    assert.equal(sent.response.status, 200);
    assert.match(providerRequest.url, /chat\/completions$/);
    assert.equal(providerRequest.options.headers.Authorization, "Bearer test-key");
    const providerBody = JSON.parse(providerRequest.options.body);
    assert.equal(providerBody.model, "test-model");
    assert.match(providerBody.messages[0].content, /Keep it practical/);
    assert.match(providerBody.messages[0].content, /tomatoes and basil/);
    assert.equal(sent.body.sources[0].name, "garden.md");

    const reopened = await jsonRequest(baseUrl, `/api/conversations/${id}`);
    assert.deepEqual(reopened.body.messages.map((message) => message.role), ["user", "assistant"]);
    const state = await jsonRequest(baseUrl, "/api/state");
    assert.equal(state.body.conversations[0].id, id);
    assert.equal(state.body.instructions, "Keep it practical.");
  });
});

test("the workspace needs no model configuration and clearly saves messages before one is connected", async () => {
  await withServer({ env: {}, fetchImpl: async () => assert.fail("provider must not be called") }, async (baseUrl) => {
    const created = await jsonRequest(baseUrl, "/api/conversations", { method: "POST", body: "{}" });
    const sent = await jsonRequest(baseUrl, `/api/conversations/${created.body.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: "Help me plan my week." })
    });
    assert.equal(sent.response.status, 503);
    assert.equal(sent.body.code, "model_not_configured");
    assert.match(sent.body.error, /no AI model is connected/i);
    const reopened = await jsonRequest(baseUrl, `/api/conversations/${created.body.id}`);
    assert.equal(reopened.body.messages[0].content, "Help me plan my week.");
  });
});

test("file uploads enforce type and size limits", async () => {
  await withServer({ env: {} }, async (baseUrl) => {
    const invalid = await jsonRequest(baseUrl, "/api/files", {
      method: "POST",
      body: JSON.stringify({ name: "secret.pdf", content: "not supported" })
    });
    assert.equal(invalid.response.status, 400);
    const oversized = await jsonRequest(baseUrl, "/api/files", {
      method: "POST",
      body: JSON.stringify({ name: "large.txt", content: "x".repeat(1_000_001) })
    });
    assert.equal(oversized.response.status, 400);
  });
});
