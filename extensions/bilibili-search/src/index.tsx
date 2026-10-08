import {
  ActionPanel,
  Action,
  List,
  Icon,
  Color,
  getPreferenceValues,
  Clipboard,
  LocalStorage,
  showToast,
  Toast,
  Keyboard,
  open,
  closeMainWindow,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { buildSearchUrl, fetchSuggestions, stripTags } from "./search.mjs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtensionPreferences {
  rememberSearchHistory: boolean;
  useClipboardFallback: boolean;
}

interface SuggestItem {
  keyword: string;
  // raw title may contain <em> tags from B站 API
  title: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_KEY = "bilibili_search_history";
const MAX_HISTORY = 10;
async function loadHistory(): Promise<string[]> {
  try {
    const raw = await LocalStorage.getItem<string>(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_HISTORY)
      : [];
  } catch {
    return [];
  }
}

async function saveToHistory(query: string, enabled: boolean): Promise<void> {
  if (!enabled || !query.trim()) return;
  try {
    const history = await loadHistory();
    const deduped = [query, ...history.filter((h) => h !== query)].slice(0, MAX_HISTORY);
    await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(deduped));
  } catch {
    // silently ignore storage errors
  }
}

async function removeFromHistory(query: string): Promise<string[]> {
  const history = await loadHistory();
  const updated = history.filter((h) => h !== query);
  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return updated;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Command() {
  const prefs = getPreferenceValues<ExtensionPreferences>();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // On mount: load history & optionally apply clipboard fallback
  useEffect(() => {
    (async () => {
      if (prefs.rememberSearchHistory) {
        const h = await loadHistory();
        setHistory(h);
      }

      if (prefs.useClipboardFallback) {
        try {
          const text = await Clipboard.readText();
          if (text && text.trim()) {
            setQuery(text.trim());
          }
        } catch {
          // clipboard read failed — no problem
        }
      }
    })();
  }, []);

  // Cancel superseded queries so slow responses cannot replace newer suggestions.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    if (!query.trim()) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }
    setSuggestions([]);
    setIsLoading(true);
    const timer = setTimeout(async () => {
      const results = await fetchSuggestions(query, controller.signal);
      if (active) {
        setSuggestions(results);
        setIsLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function handleOpen(searchQuery: string) {
    await saveToHistory(searchQuery, prefs.rememberSearchHistory);
    if (prefs.rememberSearchHistory) {
      const updated = await loadHistory();
      setHistory(updated);
    }
  }

  async function handleDeleteHistory(item: string) {
    const updated = await removeFromHistory(item);
    setHistory(updated);
    await showToast({
      style: Toast.Style.Success,
      title: "已删除",
      message: item,
    });
  }

  async function handleClearAllHistory() {
    await LocalStorage.setItem(HISTORY_KEY, JSON.stringify([]));
    setHistory([]);
    await showToast({
      style: Toast.Style.Success,
      title: "已清空搜索历史",
    });
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!query.trim()) {
    // Show history if available, otherwise show empty view
    if (prefs.rememberSearchHistory && history.length > 0) {
      return (
        <List searchBarPlaceholder="搜索哔哩哔哩…" onSearchTextChange={setQuery} throttle={false} searchText={query}>
          <List.Section title="最近搜索">
            {history.map((h) => (
              <List.Item
                key={h}
                title={h}
                icon={{ source: Icon.Clock, tintColor: Color.SecondaryText }}
                actions={
                  <ActionPanel>
                    <Action.OpenInBrowser title="搜索" url={buildSearchUrl(h)} onOpen={() => handleOpen(h)} />
                    <Action.CopyToClipboard
                      title="复制搜索链接"
                      content={buildSearchUrl(h)}
                      shortcut={Keyboard.Shortcut.Common.Copy}
                    />
                    <ActionPanel.Section>
                      <Action
                        title="删除这条记录"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={Keyboard.Shortcut.Common.Remove}
                        onAction={() => handleDeleteHistory(h)}
                      />
                      <Action
                        title="清空搜索历史"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={Keyboard.Shortcut.Common.RemoveAll}
                        onAction={handleClearAllHistory}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        </List>
      );
    }

    return (
      <List searchBarPlaceholder="搜索哔哩哔哩…" onSearchTextChange={setQuery} throttle={false} searchText={query}>
        <List.EmptyView title="搜索哔哩哔哩" description="输入关键词，查看搜索联想" icon={Icon.MagnifyingGlass} />
      </List>
    );
  }

  // ── Active search ────────────────────────────────────────────────────────────
  const allItems: Array<{ keyword: string; isSuggestion: boolean }> = [
    { keyword: query.trim(), isSuggestion: false },
    ...suggestions
      .map((s) => ({
        keyword: stripTags(s.keyword || s.title),
        isSuggestion: true,
      }))
      .filter((s) => s.keyword !== query.trim()),
  ];

  return (
    <List
      searchBarPlaceholder="搜索哔哩哔哩…"
      onSearchTextChange={setQuery}
      throttle={false}
      isLoading={isLoading}
      searchText={query}
    >
      {allItems.map((item, idx) => (
        <List.Item
          key={`${item.keyword}-${idx}`}
          title={item.keyword}
          icon={
            item.isSuggestion
              ? { source: Icon.MagnifyingGlass, tintColor: Color.SecondaryText }
              : { source: Icon.MagnifyingGlass, tintColor: Color.Blue }
          }
          actions={
            <ActionPanel>
              <Action
                title="在浏览器中搜索"
                icon={Icon.Globe}
                onAction={async () => {
                  await saveToHistory(item.keyword, prefs.rememberSearchHistory);
                  await open(buildSearchUrl(item.keyword));
                  await closeMainWindow();
                }}
              />
              <Action.CopyToClipboard
                title="复制搜索链接"
                content={buildSearchUrl(item.keyword)}
                shortcut={Keyboard.Shortcut.Common.Copy}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
