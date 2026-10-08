const SUGGEST_URL = "https://s.search.bilibili.com/main/suggest";

/** @param {string} query */
export function buildSearchUrl(query) {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(query.trim())}`;
}

/** @param {string} text */
export function stripTags(text) {
  return text.replace(/<[^>]+>/g, "");
}

/** @param {unknown} data */
export function parseSuggestions(data) {
  if (!data || typeof data !== "object" || !("result" in data)) return [];
  const result = data.result;
  if (!result || typeof result !== "object" || !("tag" in result) || !Array.isArray(result.tag)) return [];
  const seen = new Set();
  return result.tag.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof item.value !== "string") return [];
    const keyword = stripTags(item.value).trim();
    if (!keyword || seen.has(keyword)) return [];
    seen.add(keyword);
    return [{ keyword, title: typeof item.name === "string" ? stripTags(item.name) : keyword }];
  });
}

/**
 * Suggestion failures must not prevent opening a normal browser search.
 * @param {string} query
 * @param {AbortSignal} [signal]
 */
export async function fetchSuggestions(query, signal) {
  if (!query.trim() || signal?.aborted) return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  try {
    const params = new URLSearchParams({
      term: query.trim(),
      main_ver: "v1",
      highlight: "",
      userid: "",
      bangumi_acc_num: "1",
      special_acc_num: "1",
      topic_acc_num: "1",
      upuser_acc_num: "3",
      tag_num: "10",
      special_num: "10",
      bangumi_num: "10",
      upuser_num: "3",
    });
    const response = await fetch(`${SUGGEST_URL}?${params}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.bilibili.com/" },
    });
    return response.ok ? parseSuggestions(await response.json()) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
