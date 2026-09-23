import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createMatchServer } from "../server.ts";
import type { Contractor, MatchResponse } from "../src/types";

const requestBody = {
  city: "Алматы", date: "2026-10-15", category: "venue", format: "wedding", budget: 100000,
};

function contractor(id: string, overrides: Partial<Contractor> = {}): Contractor {
  return {
    id, anon_name: `Подрядчик ${id}`, categories: ["venue"], city: "Алматы",
    price_from_kzt: 100000, event_formats: ["wedding"], languages: ["ru"],
    max_hours: 8, busy_dates: [], description: `Описание площадки ${id}.`, synthetic: true,
    ...overrides,
  };
}

function openaiResponse(data: unknown): Response {
  return Response.json({
    status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] }],
  });
}

async function fixture(
  t: TestContext,
  contractors: unknown,
  responder: (body: Record<string, any>) => Response | Promise<Response>,
  apiKey = "test-key",
) {
  const directory = await mkdtemp(join(tmpdir(), "match-api-test-"));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("match-api-test-"));
    await rm(directory, { recursive: true, force: true });
  });
  const contractorsFile = join(directory, "contractors.json");
  await writeFile(contractorsFile, JSON.stringify(contractors), "utf8");
  const staticDirectory = join(directory, "dist");
  await mkdir(join(staticDirectory, "assets"), { recursive: true });
  await writeFile(join(staticDirectory, "index.html"), "<html>HACKALEM AI</html>");
  await writeFile(join(staticDirectory, "assets", "app.js"), "window.appLoaded = true;");
  await writeFile(join(directory, ".env"), "OPENAI_API_KEY=secret-test-value");
  const calls: Record<string, any>[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.temperature, 0);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.model, "gpt-4.1-mini");
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 1200);
    assert.equal(body.text.format.strict, true);
    calls.push(body);
    return responder(body);
  };
  const server = createMatchServer({ contractorsFile, apiKey, fetchImpl, staticDirectory });
  t.after(async () => {
    const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/match`;
  return {
    url, calls, contractorsFile,
    async search(body: unknown = requestBody) {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() as MatchResponse };
    },
  };
}

test("hard filters remove busy, wrong-city/category and over-budget contractors; +10% is inclusive", async (t) => {
  const included = [contractor("boundary", { price_from_kzt: 110000 }), contractor("normal")];
  const app = await fixture(t, [
    contractor("busy", { busy_dates: [requestBody.date] }),
    contractor("city", { city: "Астана" }),
    contractor("category", { categories: ["talent"] }),
    contractor("expensive", { price_from_kzt: 110001 }),
    ...included,
  ], (body) => {
    const ids = body.text.format.schema.properties.matches.items.properties.contractor_id.enum;
    assert.deepEqual(ids, ["normal", "boundary"]);
    const prompt = body.input;
    assert.match(prompt, /Выбери до 3 лучших/);
    const candidates = JSON.parse(prompt.split("Кандидаты: ")[1]);
    assert.deepEqual(candidates.map((item: Contractor) => item.id), ids);
    return openaiResponse({ matches: [{ contractor_id: "boundary", explanation: "Описание площадки boundary. Цена на 10% выше бюджета." }] });
  });
  const result = await app.search();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.matches[0].contractor, included[0]);
  assert.equal(result.data.message, "");
  assert.equal(app.calls.length, 1);
});

test("only the top five reach OpenAI, ordered by format then price", async (t) => {
  const app = await fixture(t, [
    contractor("wrong-format", { event_formats: ["concert"], price_from_kzt: 1 }),
    ...Array.from({ length: 7 }, (_, index) => contractor(`c${index}`, { price_from_kzt: 1000 + index })),
  ], (body) => {
    const ids = body.text.format.schema.properties.matches.items.properties.contractor_id.enum;
    assert.deepEqual(ids, ["c0", "c1", "c2", "c3", "c4"]);
    return openaiResponse({ matches: ids.slice(0, 3).map((id: string) => ({ contractor_id: id, explanation: `Описание ${id}.` })) });
  });
  const result = await app.search();
  assert.equal(result.status, 200);
  assert.equal(result.data.matches.length, 3);
});

test("format is not a hard filter; city/category ignore surrounding spaces and case", async (t) => {
  const app = await fixture(t, [contractor("only", { event_formats: ["concert"], busy_dates: ["2026-10-16"] })],
    () => openaiResponse({ matches: [{ contractor_id: "only", explanation: "Описание площадки only." }] }));
  const result = await app.search({ ...requestBody, city: " алматы ", category: "VENUE" });
  assert.equal(result.status, 200);
  assert.equal(result.data.matches[0].contractor.id, "only");
});

test("no candidates triggers a OpenAI refusal and returns MatchResponse", async (t) => {
  const message = "К сожалению, подходящих подрядчиков не найдено. Попробуйте изменить дату или бюджет.";
  const app = await fixture(t, [contractor("busy", { busy_dates: [requestBody.date] })],
    () => openaiResponse({ message }));
  const result = await app.search();
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { matches: [], message });
  assert.equal(app.calls.length, 1);
  assert.match(app.calls[0].input, /вежливый отказ/);
});

test("invalid form data is rejected before OpenAI", async (t) => {
  const app = await fixture(t, [], () => { throw new Error("Must not call OpenAI"); });
  for (const body of [
    null, {}, { ...requestBody, budget: "100000" }, { ...requestBody, budget: -1 },
    { ...requestBody, date: "2026-02-30" }, { ...requestBody, date: "2026-09-22" },
    { ...requestBody, city: " " }, { ...requestBody, format: "" },
  ]) {
    const result = await app.search(body);
    assert.equal(result.status, 400);
    assert.deepEqual(result.data.matches, []);
    assert.ok(result.data.message);
  }
  assert.equal(app.calls.length, 0);
});

test("zero budget only permits free contractors", async (t) => {
  const app = await fixture(t, [contractor("paid", { price_from_kzt: 1 }), contractor("free", { price_from_kzt: 0 })],
    (body) => {
      assert.deepEqual(body.text.format.schema.properties.matches.items.properties.contractor_id.enum, ["free"]);
      return openaiResponse({ matches: [{ contractor_id: "free", explanation: "Описание бесплатной площадки." }] });
    });
  assert.equal((await app.search({ ...requestBody, budget: 0 })).status, 200);
});

test("unknown IDs, duplicate IDs, empty explanations and excess matches never reach the client", async (t) => {
  const valid = { contractor_id: "valid", explanation: "Описание площадки." };
  for (const matches of [
    [{ ...valid, contractor_id: "invented" }], [valid, valid],
    [{ ...valid, explanation: " " }], [valid, valid, valid, valid], [],
  ]) {
    const app = await fixture(t, [contractor("valid")], () => openaiResponse({ matches }));
    const result = await app.search();
    assert.equal(result.status, 502);
    assert.deepEqual(result.data.matches, []);
    assert.ok(result.data.message);
  }
});

test("OpenAI failures and malformed/blocked answers become safe MatchResponse errors", async (t) => {
  const responders = [
    () => new Response("provider-internal-secret", { status: 429 }),
    () => new Response("not json"),
    () => Response.json({ status: "incomplete", output: [] }),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot answer" }] }] }),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }),
    () => { throw new Error("provider-internal-secret"); },
    () => openaiResponse({ message: " " }),
  ];
  for (const responder of responders) {
    const app = await fixture(t, [], responder);
    const result = await app.search();
    assert.equal(result.status, 502);
    assert.deepEqual(result.data.matches, []);
    assert.ok(result.data.message);
    assert.doesNotMatch(result.data.message, /provider-internal-secret/);
  }
});

test("serves the built frontend and health check without exposing secrets or source files", async (t) => {
  const app = await fixture(t, [], () => { throw new Error("Must not call OpenAI"); });
  const base = new URL(app.url).origin;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /HACKALEM/);
  const asset = await fetch(`${base}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type") ?? "", /javascript/);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const head = await fetch(base, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  for (const path of ["/.env", "/server.ts", "/data/contractors.json", "/assets/%2e%2e%2f.env", "/assets/missing.js"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /secret-test-value/);
  }
  assert.equal(app.calls.length, 0);
});

test("limits paid model requests to twenty per minute", async (t) => {
  const app = await fixture(t, [], () => openaiResponse({ message: "Подрядчиков пока нет." }));
  for (let index = 0; index < 20; index++) assert.equal((await app.search()).status, 200);
  const response = await fetch(app.url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody),
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual((await response.json()).matches, []);
  assert.equal(app.calls.length, 20);
});

test("missing API key or invalid dataset never calls OpenAI", async (t) => {
  for (const [data, apiKey] of [[[], ""], [[{ id: "invalid" }], "test-key"], [[contractor("same"), contractor("same")], "test-key"]] as const) {
    const app = await fixture(t, data, () => { throw new Error("Must not call OpenAI"); }, apiKey);
    const result = await app.search();
    assert.equal(result.status, 503);
    assert.deepEqual(result.data.matches, []);
    assert.ok(result.data.message);
    assert.equal(app.calls.length, 0);
  }
});

test("the API only exposes POST /api/match and rejects invalid JSON/content types", async (t) => {
  const app = await fixture(t, [], () => { throw new Error("Must not call OpenAI"); });
  const getResponse = await fetch(app.url);
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");
  const oldEndpoint = await fetch(app.url.replace("/api/match", "/api/chat"), { method: "POST" });
  assert.equal(oldEndpoint.status, 404);
  for (const [body, contentType, expected] of [
    ["{", "application/json", 400], ["{}", "text/plain", 415],
    [JSON.stringify({ padding: "x".repeat(20 * 1024) }), "application/json", 413],
  ] as const) {
    const response = await fetch(app.url, { method: "POST", headers: { "Content-Type": contentType }, body });
    assert.equal(response.status, expected);
    const data = await response.json();
    assert.deepEqual(data.matches, []);
    assert.ok(data.message);
  }
  assert.equal(app.calls.length, 0);
});

test("the bundled demo dataset loads and returns the original contractor", async (t) => {
  const data = JSON.parse(await readFile(new URL("../data/contractors.json", import.meta.url), "utf8")) as Contractor[];
  assert.equal(data.length, 6);
  assert.ok(data.every((item) => item.synthetic));
  const app = await fixture(t, data, () => openaiResponse({
    matches: [{ contractor_id: "demo-6", explanation: "Площадка предлагает сад с крытой террасой и зоной для церемонии." }],
  }));
  const result = await app.search({ ...requestBody, budget: 350000 });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.matches[0].contractor, data.find((item) => item.id === "demo-6"));
});
