import test from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, parseSuggestions, fetchSuggestions } from "../src/search.mjs";

test("Chinese and URL punctuation stay in one keyword parameter", () => {
  const url = new URL(buildSearchUrl("  哔哩哔哩 & Windows?#  "));
  assert.equal(url.origin, "https://search.bilibili.com");
  assert.equal(url.searchParams.get("keyword"), "哔哩哔哩 & Windows?#");
  assert.equal([...url.searchParams].length, 1);
  assert.equal(url.hash, "");
});

test("suggestions tolerate invalid responses, remove markup and deduplicate", () => {
  for (const data of [null, {}, { result: { tag: "bad" } }]) assert.deepEqual(parseSuggestions(data), []);
  assert.deepEqual(
    parseSuggestions({
      result: {
        tag: [null, { value: 3 }, { value: "" }, { value: "<em>中文</em>", name: "<em>中文</em>" }, { value: "中文" }],
      },
    }),
    [{ keyword: "中文", title: "中文" }],
  );
});

test("suggestion requests encode terms and retain direct-search fallback on failures", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(new URL(url).searchParams.get("term"), "中文 & test");
    return new Response(JSON.stringify({ result: { tag: [{ value: "中文测试" }] } }));
  });
  assert.deepEqual(await fetchSuggestions("中文 & test"), [{ keyword: "中文测试", title: "中文测试" }]);
  globalThis.fetch.mock.mockImplementation(async () => new Response("", { status: 503 }));
  assert.deepEqual(await fetchSuggestions("中文"), []);
  globalThis.fetch.mock.mockImplementation(async () => {
    throw new Error("offline");
  });
  assert.deepEqual(await fetchSuggestions("中文"), []);
});

test("cancelling an obsolete query aborts the network request", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  );
  const controller = new AbortController();
  const pending = fetchSuggestions("old", controller.signal);
  controller.abort();
  assert.deepEqual(await pending, []);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
  assert.deepEqual(await fetchSuggestions("", controller.signal), []);
  assert.equal(globalThis.fetch.mock.callCount(), 1);
});
