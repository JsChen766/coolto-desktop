import type {
  BrowserAgentChromeView,
  BrowserLocale,
} from "../../shared/types.js";

const HOME_MARKER = "#coolto-browser-home";

interface HomeCopy {
  brand: string;
  continueTask: string;
  pageTitle: string;
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
<title>${copy.pageTitle}</title>
<style>
  :root { color-scheme: ${theme}; }
  * { box-sizing: border-box; }
  body { display: flow-root; margin: 0; min-height: 100vh;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", sans-serif; background: ${dark ? "#1b1b19" : "#fbfbfa"};
    color: ${dark ? "#fbfbfa" : "#1b1b19"}; }
  main { width: min(680px, calc(100vw - 32px)); display: grid; gap: 28px;
    margin: clamp(72px, 24vh, 220px) auto 40px; }
  .brand { display: flex; align-items: center; gap: 11px; font-size: 24px;
    font-weight: 650; letter-spacing: -.02em; }
  .brand-mark { display: grid; place-items: center; width: 32px; height: 32px;
    border-radius: 9px; background: ${dark ? "#fbfbfa" : "#1b1b19"};
    color: ${dark ? "#1b1b19" : "#fbfbfa"}; font-size: 16px; }
  .search { display: flex; align-items: center; gap: 12px; min-height: 52px;
    padding: 0 17px; border: 0; border-radius: 26px;
    background: ${dark ? "rgb(251 251 250 / 8%)" : "rgb(27 27 25 / 5%)"};
    transition: background-color 120ms cubic-bezier(.25, 1, .5, 1),
      box-shadow 80ms cubic-bezier(.25, 1, .5, 1); }
  .search:hover { background: ${dark ? "rgb(251 251 250 / 12%)" : "rgb(27 27 25 / 8%)"}; }
  .search:focus-within { background: ${dark ? "#1b1b19" : "#fbfbfa"};
    box-shadow: 0 0 0 2px ${dark ? "#1b1b19" : "#fbfbfa"},
      0 0 0 4px ${dark ? "#fbfbfa" : "#1b1b19"}; }
  .search svg { flex: none; color: ${dark ? "#b9b9b5" : "#626260"}; }
  input { flex: 1; min-width: 0; border: 0; outline: 0; font: inherit;
    background: transparent; color: inherit; font-size: 14px; }
  input::placeholder { color: ${dark ? "#b9b9b5" : "#626260"}; opacity: 1; }
  .task { display: grid; gap: 8px; padding-top: 2px; }
  .task-main { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto auto;
    align-items: center; gap: 12px; min-width: 0; }
  .task-status { display: grid; place-items: center; width: 16px; height: 16px;
    color: ${dark ? "#b9b9b5" : "#626260"}; }
  .task-status::before { display: block; }
  .task-status.active::before { content: ""; width: 8px; height: 8px;
    border: 1.5px solid currentColor; border-top-color: transparent; border-radius: 50%;
    animation: task-turn 900ms linear infinite; }
  .task-status.waiting::before { content: "!"; font-size: 13px; font-weight: 700; }
  .task-title { min-width: 0; margin: 0; overflow: hidden;
    color: ${dark ? "#b9b9b5" : "#626260"}; font-size: 13px;
    text-overflow: ellipsis; white-space: nowrap; }
  .task-title strong { color: ${dark ? "#fbfbfa" : "#1b1b19"}; font-weight: 600; }
  .task-time { color: ${dark ? "#b9b9b5" : "#626260"}; font-size: 12px;
    white-space: nowrap; }
  .task-action { flex: none; border-radius: 8px; padding: 9px 12px;
    background: ${dark ? "#fbfbfa" : "#1b1b19"};
    color: ${dark ? "#1b1b19" : "#fbfbfa"}; font-size: 12px;
    font-weight: 600; text-decoration: none; transition: transform 80ms
    cubic-bezier(.25, 1, .5, 1); }
  .task-action:active { transform: scale(.98); }
  .task-action:focus-visible { outline: 2px solid ${dark ? "#fbfbfa" : "#1b1b19"};
    outline-offset: 3px; }
  .waiting { display: grid; gap: 5px; margin: 0 0 0 30px; padding: 0;
    list-style: none; }
  .waiting li { display: flex; align-items: center; gap: 8px; min-height: 28px;
    color: ${dark ? "#b9b9b5" : "#626260"}; font-size: 12px; }
  .waiting li::before { content: ""; width: 4px; height: 4px;
    background: ${dark ? "#fbfbfa" : "#1b1b19"}; }
  @keyframes task-turn { to { transform: rotate(360deg); } }
  @media (max-width: 600px) {
    .task-main { grid-template-columns: 18px minmax(0, 1fr) auto; gap: 8px 10px; }
    .task-time { grid-column: 2; }
    .task-action { grid-column: 3; grid-row: 1 / span 2; }
  }
  @media (prefers-reduced-motion: no-preference) {
    main { animation: home-enter 160ms cubic-bezier(.25, 1, .5, 1) both; }
  }
  @media (prefers-reduced-motion: reduce) {
    .search, .task-action { transition: none; }
    .task-status.active::before { animation: none; border-top-color: currentColor; }
  }
  @keyframes home-enter { from { opacity: 0; } }
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
  const separator = locale === "zh-CN" ? "：" : ": ";
  const items = task.waitingItems.slice(0, 3).map((item) =>
    `<li>${escapeHtml(homeActionLabel(item, locale))}</li>`).join("");
  return `<section class="task" aria-label="${escapeHtml(state)}">
    <div class="task-main">
      <span class="task-status ${task.state}" role="img" aria-label="${escapeHtml(state)}"></span>
      <p class="task-title" title="${escapeHtml(task.goal)}"><strong>${escapeHtml(state)}${separator}</strong>${escapeHtml(task.goal)}</p>
      <time class="task-time" datetime="${escapeHtml(task.updatedAt)}">${escapeHtml(copy.updatedAt)} ${escapeHtml(updated)}</time>
      <a class="task-action" href="${homeActionUrl(internalToken)}">${escapeHtml(copy.continueTask)}</a>
    </div>
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
        brand: "Coolto",
        continueTask: "Continue task",
        pageTitle: "Coolto Browser",
        taskActive: "Current task",
        taskWaiting: "Needs your attention",
        placeholder: "Search or enter a web address",
        updatedAt: "Updated",
      }
    : {
        brand: "Coolto",
        continueTask: "继续任务",
        pageTitle: "Coolto 浏览器",
        taskActive: "当前任务",
        taskWaiting: "等待你处理",
        placeholder: "搜索或输入网址",
        updatedAt: "更新于",
      };
}
