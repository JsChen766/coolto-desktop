import type {
  BrowserAgentChromeView,
  BrowserLocale,
} from "../../shared/types.js";

const HOME_MARKER = "#coolto-browser-home";

interface HomeCopy {
  brand: string;
  continueTask: string;
  hint: string;
  taskActive: string;
  taskWaiting: string;
  placeholder: string;
  updatedAt: string;
}

export interface BrowserHomeTaskSnapshot {
  goal: string;
  state: "active" | "waiting";
  updatedAt: string;
  waitingItems: string[];
}

export function browserHomeUrl(
  theme: "light" | "dark",
  locale: BrowserLocale,
  internalToken: string,
  task: BrowserHomeTaskSnapshot | null = null,
): string {
  const copy = homeCopy(locale);
  const dark = theme === "dark";
  const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="${theme}" />
<title>${copy.brand}</title>
<style>
  :root { color-scheme: ${theme}; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", sans-serif; background: ${dark ? "#1b1b19" : "#fbfbfa"};
    color: ${dark ? "#edede8" : "#20201e"}; }
  main { width: min(680px, calc(100vw - 48px)); display: grid; gap: 22px; }
  .brand { display: flex; align-items: center; gap: 10px; font-size: 21px;
    font-weight: 650; letter-spacing: -.02em; }
  .brand-mark { display: grid; place-items: center; width: 28px; height: 28px;
    border-radius: 8px; background: ${dark ? "#edede8" : "#20201e"};
    color: ${dark ? "#20201e" : "#fbfbfa"}; font-size: 15px; }
  form { display: grid; gap: 10px; }
  .search { display: flex; align-items: center; gap: 11px; min-height: 48px;
    padding: 0 15px; border: 1px solid ${dark ? "#494943" : "#d6d5d0"};
    border-radius: 12px; background: ${dark ? "#252523" : "#ffffff"}; }
  .search:focus-within { border-color: ${dark ? "#b5b2aa" : "#4a4944"}; }
  .search svg { flex: none; color: ${dark ? "#85827a" : "#7b7971"}; }
  input { flex: 1; min-width: 0; border: 0; outline: 0; font: inherit;
    background: transparent; color: inherit; }
  input::placeholder { color: ${dark ? "#b5b2aa" : "#4a4944"}; opacity: 1; }
  .hint { margin: 0; color: ${dark ? "#b5b2aa" : "#4a4944"}; font-size: 13px; }
  .task { display: grid; gap: 9px; padding-top: 4px; }
  .task-head { display: flex; align-items: center; justify-content: space-between;
    gap: 16px; }
  .task-label { display: flex; align-items: center; gap: 8px; min-width: 0;
    color: ${dark ? "#b5b2aa" : "#4a4944"}; font-size: 12px; }
  .task-dot { width: 7px; height: 7px; border-radius: 50%;
    background: ${task?.state === "waiting" ? "#c68a24" : "#356fca"}; }
  .task-title { margin: 0; overflow: hidden; font-size: 14px; font-weight: 600;
    text-overflow: ellipsis; white-space: nowrap; }
  .task-time { color: ${dark ? "#a8a59d" : "#62605a"}; font-size: 11px; }
  .task-action { flex: none; border-radius: 8px; padding: 7px 10px;
    background: ${dark ? "#30302d" : "#ececea"}; color: inherit; font-size: 12px;
    font-weight: 600; text-decoration: none; }
  .task-action:focus-visible { outline: 2px solid ${dark ? "#78a7f5" : "#356fca"};
    outline-offset: 2px; }
  .waiting { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
  .waiting li { display: flex; align-items: center; gap: 8px; min-height: 28px;
    color: ${dark ? "#b5b2aa" : "#4a4944"}; font-size: 12px; }
  .waiting li::before { content: ""; width: 4px; height: 4px; border-radius: 50%;
    background: ${dark ? "#e2b65f" : "#8a5a00"}; }
</style>
</head>
<body>
  <main>
    <div class="brand"><span class="brand-mark">C</span>${copy.brand}</div>
    <form id="search-form">
      <div class="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>
        </svg>
        <input id="q" type="text" autocomplete="off"
          placeholder="${copy.placeholder}" aria-label="${copy.placeholder}" />
      </div>
      <p class="hint">${copy.hint}</p>
    </form>
    ${taskMarkup(task, copy, locale, internalToken)}
  </main>
  <script>
    document.getElementById("search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var value = document.getElementById("q").value.trim();
      if (value) window.location.href = "https://www.bing.com/search?q=" + encodeURIComponent(value);
    });
  </script>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}${homeMarker(internalToken)}`;
}

export function isBrowserHomeUrl(url: string, internalToken: string): boolean {
  return url.endsWith(homeMarker(internalToken));
}

export function isBrowserHomeActionUrl(url: string, internalToken: string): boolean {
  return url === homeActionUrl(internalToken);
}

export function browserHomeTaskSnapshot(
  agent: BrowserAgentChromeView | null,
): BrowserHomeTaskSnapshot | null {
  if (!agent || !ACTIVE_PHASES.has(agent.phase)) return null;
  const waitingItems = agent.requiredUserAction
    ? [agent.requiredUserAction.label].slice(0, 3) : [];
  return {
    goal: agent.goal.slice(0, 240),
    state: waitingItems.length > 0 || agent.phase === "waiting" ? "waiting" : "active",
    updatedAt: agent.updatedAt,
    waitingItems,
  };
}

export function browserHomeTaskKey(task: BrowserHomeTaskSnapshot | null): string {
  return JSON.stringify(task ? {
    goal: task.goal,
    state: task.state,
    waitingItems: task.waitingItems,
  } : null);
}

function homeMarker(internalToken: string): string {
  return `${HOME_MARKER}:${encodeURIComponent(internalToken)}`;
}

const ACTIVE_PHASES = new Set<BrowserAgentChromeView["phase"]>([
  "queued", "planning", "acting", "waiting", "reviewing", "paused", "user_control",
]);

function homeActionUrl(internalToken: string): string {
  return `coolto-browser-action://open-task/${encodeURIComponent(internalToken)}`;
}

function taskMarkup(
  task: BrowserHomeTaskSnapshot | null,
  copy: HomeCopy,
  locale: BrowserLocale,
  internalToken: string,
): string {
  if (!task) return "";
  const state = task.state === "waiting" ? copy.taskWaiting : copy.taskActive;
  const updated = formatUpdatedAt(task.updatedAt, locale);
  const items = task.waitingItems.slice(0, 3).map((item) =>
    `<li>${escapeHtml(homeActionLabel(item, locale))}</li>`).join("");
  return `<section class="task" aria-label="${escapeHtml(state)}">
    <div class="task-head">
      <div class="task-label"><span class="task-dot" aria-hidden="true"></span>
        <span>${escapeHtml(state)}</span><span class="task-time">${escapeHtml(copy.updatedAt)} ${escapeHtml(updated)}</span>
      </div>
      <a class="task-action" href="${homeActionUrl(internalToken)}">${escapeHtml(copy.continueTask)}</a>
    </div>
    <p class="task-title" title="${escapeHtml(task.goal)}">${escapeHtml(task.goal)}</p>
    ${items ? `<ul class="waiting">${items}</ul>` : ""}
  </section>`;
}

function formatUpdatedAt(value: string, locale: BrowserLocale): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function homeActionLabel(value: string, locale: BrowserLocale): string {
  if (locale === "zh-CN") return value;
  return ({
    "等待你审核页面修改": "Review page changes",
    "等待你确认": "Complete the pending approval",
    "完成待确认操作": "Complete the pending approval",
    "等待你回答": "Answer Agent",
    "等待你交还控制": "Return control to Agent",
    "继续任务": "Resume task",
  } as Record<string, string>)[value] ?? value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function homeCopy(locale: BrowserLocale): HomeCopy {
  return locale === "en-US"
    ? {
        brand: "Coolto Browser",
        continueTask: "Continue current task",
        hint: "Press Enter to search with Bing",
        taskActive: "Current task",
        taskWaiting: "Needs your attention",
        placeholder: "Search or enter a web address",
        updatedAt: "Updated",
      }
    : {
        brand: "Coolto 浏览器",
        continueTask: "继续当前任务",
        hint: "按 Enter 使用 Bing 搜索",
        taskActive: "当前任务",
        taskWaiting: "等待你处理",
        placeholder: "搜索或输入网址",
        updatedAt: "更新于",
      };
}
