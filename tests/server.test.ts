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
  city: "Алматы", date: "2026-10-15", category: "Ведущий", format: "корпоратив", budget: 100000,
};

function contractor(id: string, overrides: Partial<Contractor> = {}): Contractor {
  return {
    id, anon_name: `Подрядчик ${id}`, categories: ["Ведущий"], city: "Алматы",
    price_from_kzt: 100000, event_formats: ["корпоратив"], languages: ["русский"],
    max_hours: 8, busy_dates: [], description: `Описание ведущего ${id}. Проводит корпоративы.`, synthetic: true,
    city_imputed: false, price_imputed: false, ...overrides,
  };
}

function openaiResponse(data: unknown): Response {
  return Response.json({ status: "completed", output: [
    { type: "message", content: [{ type: "output_text", text: JSON.stringify(data) }] },
  ] });
}

function explanationData(body: Record<string, any>): { request: Record<string, unknown>; candidates: Contractor[]; selected_ids: string[] } {
  return JSON.parse(body.input.split("Данные для объяснений: ")[1]);
}

function explainSelected(body: Record<string, any>): Response {
  return openaiResponse({ matches: explanationData(body).selected_ids.map((id) => ({
    contractor_id: id, explanation: `В описании подрядчика ${id} указано проведение корпоративов.`,
  })) });
}

async function fixture(t: TestContext, contractors: unknown,
  responder: (body: Record<string, any>) => Response | Promise<Response> = explainSelected, apiKey = "test-key") {
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
    calls.push(body);
    assert.equal(body.temperature, 0);
    assert.equal(body.text.format.type, "json_schema");
    assert.equal(body.model, "gpt-4.1-mini");
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 1200);
    assert.equal(body.text.format.strict, true);
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
  return { url, calls, contractorsFile, async search(body: unknown = requestBody) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() as MatchResponse };
  } };
}

test("hard filters enforce city, category, dates, budget, format, language and duration", async (t) => {
  const included = [contractor("boundary", { price_from_kzt: 110000 }), contractor("normal")];
  const app = await fixture(t, [
    contractor("busy", { busy_dates: [requestBody.date] }), contractor("city", { city: "Астана" }),
    contractor("category", { categories: ["Флорист"] }), contractor("expensive", { price_from_kzt: 110001 }),
    contractor("format", { event_formats: ["свадьба"] }), contractor("language", { languages: ["казахский"] }),
    contractor("duration", { max_hours: 4 }), ...included,
  ]);
  const result = await app.search({ ...requestBody, language: "русский", duration_hours: 6 });
  assert.equal(result.status, 200);
  assert.equal(result.data.status, "matched");
  assert.deepEqual(result.data.matches.map((item) => item.contractor.id), ["normal", "boundary"]);
  assert.deepEqual(result.data.matches[1].contractor, included[0]);
  assert.equal(result.data.explanation_source, "openai");
  assert.ok(result.data.message, "Explain why fewer than three contractors are available");
  assert.deepEqual(result.data.summary, { total_in_category: 7, eligible: 2,
    excluded: { busy: 1, budget: 1, format: 1, language: 1, duration: 1 } });
  assert.equal(app.calls.length, 1);
});

test("only five ranked candidates reach OpenAI and only the three fixed IDs are allowed", async (t) => {
  const app = await fixture(t, [contractor("wrong-format", { event_formats: ["свадьба"], price_from_kzt: 1 }),
    ...Array.from({ length: 7 }, (_, i) => contractor(`c${6 - i}`, { price_from_kzt: 1000 + 6 - i }))]);
  const result = await app.search();
  assert.equal(result.status, 200);
  assert.equal(result.data.explanation_source, "openai");
  assert.deepEqual(result.data.matches.map((item) => item.contractor.id), ["c0", "c1", "c2"]);
  assert.equal(result.data.message, "");
  const body = app.calls[0];
  const prompt = explanationData(body);
  assert.deepEqual(prompt.candidates.map((item) => item.id), ["c0", "c1", "c2", "c3", "c4"]);
  assert.deepEqual(prompt.selected_ids, ["c0", "c1", "c2"]);
  assert.deepEqual(body.text.format.schema.properties.matches.items.properties.contractor_id.enum, prompt.selected_ids);
});

test("selection is repeatable and model order cannot change the server ranking", async (t) => {
  const app = await fixture(t, [contractor("c"), contractor("a"), contractor("d"), contractor("b")], (body) =>
    openaiResponse({ matches: [...explanationData(body).selected_ids].reverse().map((id) => ({ contractor_id: id, explanation: `Описание ${id}.` })) }));
  const first = await app.search();
  const second = await app.search();
  assert.equal(first.data.explanation_source, "openai");
  const selected = explanationData(app.calls[0]).selected_ids;
  assert.deepEqual(first.data.matches.map((item) => item.contractor.id), selected);
  assert.deepEqual(second.data.matches, first.data.matches);
  assert.equal(first.data.matches.length, 3);
  assert.equal(new Set(selected).size, 3);
});

test("city, category and format matching tolerates surrounding spaces and case", async (t) => {
  const app = await fixture(t, [contractor("only")]);
  const result = await app.search({ ...requestBody, city: " алматы ", category: " ВЕДУЩИЙ ", format: " КОРПОРАТИВ " });
  assert.equal(result.status, 200);
  assert.equal(result.data.status, "matched");
  assert.equal(result.data.matches[0].contractor.id, "only");
});

test("optional language and duration constraints preserve unknown max_hours", async (t) => {
  const app = await fixture(t, [contractor("unknown", { max_hours: null }), contractor("short", { max_hours: 4 }),
    contractor("kazakh", { languages: ["казахский"] })]);
  assert.equal((await app.search()).data.matches.length, 3);
  const result = await app.search({ ...requestBody, language: "русский", duration_hours: 8 });
  assert.deepEqual(result.data.matches.map((item) => item.contractor.id), ["unknown"]);
  assert.equal(result.data.matches[0].contractor.max_hours, null);
  assert.equal(result.data.summary?.excluded.duration, 1);
  assert.equal(result.data.summary?.excluded.language, 1);
});

test("empty results distinguish an absent category from unavailable contractors without calling AI", async (t) => {
  const app = await fixture(t, [contractor("busy", { busy_dates: [requestBody.date] })], () => { throw new Error("Must not call OpenAI"); });
  const unavailable = await app.search();
  assert.equal(unavailable.status, 200);
  assert.equal(unavailable.data.status, "no_match");
  assert.deepEqual(unavailable.data.matches, []);
  assert.ok(unavailable.data.message);
  assert.equal(unavailable.data.summary?.total_in_category, 1);
  assert.equal(unavailable.data.summary?.excluded.busy, 1);
  for (const request of [{ ...requestBody, category: "Флорист" }, { ...requestBody, city: "Зарубежье" }]) {
    const absent = await app.search(request);
    assert.equal(absent.status, 200);
    assert.equal(absent.data.status, "no_category");
    assert.deepEqual(absent.data.matches, []);
    assert.ok(absent.data.message);
    assert.equal(absent.data.summary?.total_in_category, 0);
  }
  assert.equal(app.calls.length, 0);
});

test("invalid form fields and dates outside the dataset period are rejected before AI", async (t) => {
  const app = await fixture(t, [], () => { throw new Error("Must not call OpenAI"); });
  for (const body of [null, {}, { ...requestBody, budget: "100000" }, { ...requestBody, budget: -1 },
    { ...requestBody, date: "2026-02-30" }, { ...requestBody, date: "2026-09-22" },
    { ...requestBody, date: "2027-01-01" }, { ...requestBody, date: "2026-11-31" },
    { ...requestBody, city: " " }, { ...requestBody, format: "" }, { ...requestBody, duration_hours: 0 },
    { ...requestBody, duration_hours: -1 }, { ...requestBody, duration_hours: "8" }, { ...requestBody, language: 3 }]) {
    const result = await app.search(body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.data.status, "error");
    assert.deepEqual(result.data.matches, []);
    assert.ok(result.data.message);
  }
  assert.equal(app.calls.length, 0);
});

test("both date bounds are inclusive and zero budget permits only free contractors", async (t) => {
  const app = await fixture(t, [contractor("paid", { price_from_kzt: 1 }), contractor("free", { price_from_kzt: 0 })]);
  for (const date of ["2026-09-23", "2026-12-31"]) {
    const result = await app.search({ ...requestBody, budget: 0, date });
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.matches.map((item) => item.contractor.id), ["free"]);
  }
});

test("unknown, duplicate, missing or excess model IDs and empty explanations use the local fallback", async (t) => {
  const valid = { contractor_id: "valid", explanation: "Описание ведущего." };
  for (const matches of [[{ ...valid, contractor_id: "invented" }], [valid, valid],
    [{ ...valid, explanation: " " }], [valid, valid, valid, valid], []]) {
    const app = await fixture(t, [contractor("valid")], () => openaiResponse({ matches }));
    const result = await app.search();
    assert.equal(result.status, 200);
    assert.equal(result.data.status, "matched");
    assert.equal(result.data.explanation_source, "local");
    assert.deepEqual(result.data.matches.map((item) => item.contractor.id), ["valid"]);
    assert.ok(result.data.matches[0].explanation.trim());
    assert.doesNotMatch(result.data.matches[0].explanation, /invented/);
  }
});

test("a model cannot replace a selected contractor with the fourth eligible candidate", async (t) => {
  const app = await fixture(t, Array.from({ length: 4 }, (_, i) => contractor(`c${i}`, { price_from_kzt: 1000 + i })),
    () => openaiResponse({ matches: ["c0", "c1", "c3"].map((id) => ({ contractor_id: id, explanation: `Описание ${id}.` })) }));
  const result = await app.search();
  assert.equal(result.data.explanation_source, "local");
  assert.deepEqual(result.data.matches.map((item) => item.contractor.id), ["c0", "c1", "c2"]);
});

test("OpenAI failures and malformed or blocked answers preserve deterministic local results", async (t) => {
  const responders = [() => new Response("provider-internal-secret", { status: 429 }), () => new Response("not json"),
    () => Response.json({ status: "incomplete", output: [] }),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot answer" }] }] }),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] }),
    () => { throw new Error("provider-internal-secret"); }, () => openaiResponse({ message: " " })];
  for (const responder of responders) {
    const app = await fixture(t, [contractor("available")], responder);
    const result = await app.search();
    assert.equal(result.status, 200);
    assert.equal(result.data.status, "matched");
    assert.equal(result.data.explanation_source, "local");
    assert.equal(result.data.matches[0].contractor.id, "available");
    assert.ok(result.data.matches[0].explanation.trim());
    assert.doesNotMatch(JSON.stringify(result.data), /provider-internal-secret/);
  }
});

test("missing API key provides local explanations without calling OpenAI", async (t) => {
  const app = await fixture(t, [contractor("available")], () => { throw new Error("Must not call OpenAI"); }, "");
  const result = await app.search();
  assert.equal(result.status, 200);
  assert.equal(result.data.status, "matched");
  assert.equal(result.data.explanation_source, "local");
  assert.equal(result.data.matches[0].contractor.id, "available");
  assert.ok(result.data.matches[0].explanation.trim());
  assert.equal(app.calls.length, 0);
});

test("invalid datasets fail with a safe error before OpenAI", async (t) => {
  for (const data of [[{ id: "invalid" }], [contractor("same"), contractor("same")], [contractor("invalid-date", { busy_dates: ["2026-11-31"] })]]) {
    const app = await fixture(t, data, () => { throw new Error("Must not call OpenAI"); });
    const result = await app.search();
    assert.equal(result.status, 503);
    assert.equal(result.data.status, "error");
    assert.deepEqual(result.data.matches, []);
    assert.ok(result.data.message);
    assert.equal(app.calls.length, 0);
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
  const app = await fixture(t, [contractor("available")]);
  for (let index = 0; index < 20; index++) assert.equal((await app.search()).status, 200);
  const response = await fetch(app.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  assert.deepEqual((await response.json()).matches, []);
  assert.equal(app.calls.length, 20);
});

test("the API only exposes POST /api/match and rejects invalid JSON/content types", async (t) => {
  const app = await fixture(t, [], () => { throw new Error("Must not call OpenAI"); });
  const getResponse = await fetch(app.url);
  assert.equal(getResponse.status, 405);
  assert.equal(getResponse.headers.get("allow"), "POST");
  const oldEndpoint = await fetch(app.url.replace("/api/match", "/api/chat"), { method: "POST" });
  assert.equal(oldEndpoint.status, 404);
  for (const [body, contentType, expected] of [["{", "application/json", 400], ["{}", "text/plain", 415],
    [JSON.stringify({ padding: "x".repeat(20 * 1024) }), "application/json", 413]] as const) {
    const response = await fetch(app.url, { method: "POST", headers: { "Content-Type": contentType }, body });
    assert.equal(response.status, expected);
    const data = await response.json();
    assert.deepEqual(data.matches, []);
    assert.ok(data.message);
  }
  assert.equal(app.calls.length, 0);
});

test("the complete anonymized dataset preserves profiles, nullable hours and source flags", async (t) => {
  const data = JSON.parse(await readFile(new URL("../data/contractors.json", import.meta.url), "utf8")) as Contractor[];
  assert.equal(data.length, 66);
  assert.equal(new Set(data.map((item) => item.id)).size, 66);
  assert.equal(data.filter((item) => item.synthetic).length, 13);
  assert.equal(data.filter((item) => item.city_imputed).length, 8);
  assert.equal(data.filter((item) => item.price_imputed).length, 18);
  assert.equal(data.filter((item) => item.max_hours === null).length, 9);
  const app = await fixture(t, data);
  const query = { city: "Алматы", category: "Флорист", date: "2026-09-23", budget: 300000, format: "свадьба", language: "русский" };
  const result = await app.search(query);
  assert.equal(result.status, 200);
  assert.equal(result.data.status, "matched");
  assert.equal(result.data.explanation_source, "openai");
  assert.ok(result.data.message);
  assert.deepEqual(new Set(result.data.matches.map((item) => item.contractor.id)), new Set(["HK-39372", "HK-90001"]));
  for (const match of result.data.matches) assert.deepEqual(match.contractor, data.find((item) => item.id === match.contractor.id));
  const busy = await app.search({ ...query, date: "2026-09-25" });
  assert.equal(busy.data.status, "no_match");
  assert.deepEqual(busy.data.matches, []);
  assert.equal(busy.data.summary?.excluded.busy, 2);
  const absent = await app.search({ ...query, city: "Зарубежье" });
  assert.equal(absent.data.status, "no_category");
  assert.equal(app.calls.length, 1);
});

test("late December refusals follow actual florist calendars instead of blocking the whole week", async (t) => {
  const data = JSON.parse(await readFile(new URL("../data/contractors.json", import.meta.url), "utf8")) as Contractor[];
  const app = await fixture(t, data);
  const query = { city: "Алматы", category: "Флорист", budget: 300000, format: "свадьба", language: "русский" };

  for (const date of ["2026-12-25", "2026-12-27", "2026-12-30"]) {
    const result = await app.search({ ...query, date });
    assert.equal(result.status, 200);
    assert.equal(result.data.status, "no_match");
    assert.deepEqual(result.data.matches, []);
    assert.deepEqual(result.data.summary, {
      total_in_category: 2, eligible: 0,
      excluded: { busy: 2, budget: 0, format: 0, language: 0, duration: 0 },
    });
    assert.match(result.data.message, /заняты на дату — 2/u);
    assert.equal(app.calls.length, 0);
  }

  const available = await app.search({ ...query, date: "2026-12-29" });
  assert.equal(available.status, 200);
  assert.equal(available.data.status, "matched");
  assert.equal(available.data.summary?.eligible, 2);
  assert.deepEqual(new Set(available.data.matches.map((item) => item.contractor.id)), new Set(["HK-39372", "HK-90001"]));
  assert.equal(app.calls.length, 1);
});

test("actual busy calendars change the candidate pool on the next date without relaxing constraints", async (t) => {
  const data = JSON.parse(await readFile(new URL("../data/contractors.json", import.meta.url), "utf8")) as Contractor[];
  const app = await fixture(t, data);
  const query = { city: "Алматы", category: "Ведущий", date: "2026-10-06", budget: 1000000, format: "корпоратив", language: "русский" };
  const first = await app.search(query);
  const second = await app.search({ ...query, date: "2026-10-09" });
  for (const [result, date, eligible] of [[first, "2026-10-06", 6], [second, "2026-10-09", 4]] as const) {
    assert.equal(result.data.status, "matched");
    assert.equal(result.data.explanation_source, "openai");
    assert.equal(result.data.matches.length, 3);
    assert.equal(result.data.summary?.eligible, eligible);
    for (const { contractor: item } of result.data.matches) {
      assert.equal(item.city, query.city);
      assert.ok(item.categories.includes(query.category));
      assert.ok(item.event_formats.includes(query.format));
      assert.ok(item.languages.includes(query.language));
      assert.ok(item.price_from_kzt <= query.budget * 1.1);
      assert.ok(!item.busy_dates.includes(date));
    }
  }
  const firstIds = explanationData(app.calls[0]).candidates.map((item) => item.id);
  const secondIds = explanationData(app.calls[1]).candidates.map((item) => item.id);
  assert.notDeepEqual(firstIds, secondIds);
  assert.ok(!secondIds.includes("HK-44923"));
  assert.ok(!firstIds.includes("HK-77838"));
  assert.notDeepEqual(first.data.matches.map((item) => item.contractor.id), second.data.matches.map((item) => item.contractor.id));
  assert.deepEqual((await app.search(query)).data.matches, first.data.matches);
});
