/**
 * B1: 内置浏览器自定义主页。
 * 未指定 URL 打开浏览器时加载此页：Coolto 标题 + 仿 Google 的搜索框。
 * 回车后跳转 Bing 搜索结果页（纯搜索，不把输入直接当 URL 导航）。
 * 地址栏保持只读，页面内搜索框是唯一的用户主动导航入口。
 */
const HOME_PAGE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Coolto</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    font-family:
      Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Microsoft YaHei", sans-serif;
    background: #fbfbfa;
    color: #20201e;
  }
  .brand { font-size: 64px; font-weight: 700; letter-spacing: -1px; }
  form { width: min(560px, 88vw); }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 20px;
    border: 1px solid #e3e3df;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 18px 50px rgb(37 36 31 / 8%);
    transition: box-shadow 0.15s ease, border-color 0.15s ease;
  }
  .search:focus-within {
    border-color: #d6d5d0;
  }
  .search svg { flex: none; opacity: 0.5; }
  input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 16px;
    background: transparent;
    color: inherit;
  }
  .hint { font-size: 13px; color: #7b7971; }
</style>
</head>
<body>
  <div class="brand">Coolto</div>
  <form id="search-form">
    <div class="search">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input id="q" type="text" autofocus autocomplete="off" placeholder="搜索岗位、公司或职位描述" aria-label="搜索" />
    </div>
  </form>
  <div class="hint">回车通过 Bing 搜索</div>
  <script>
    document.getElementById("search-form").addEventListener("submit", function (event) {
      event.preventDefault();
      var value = document.getElementById("q").value.trim();
      if (!value) return;
      window.location.href = "https://www.bing.com/search?q=" + encodeURIComponent(value);
    });
  </script>
</body>
</html>`;

export const BROWSER_HOME_URL = `data:text/html;charset=utf-8,${encodeURIComponent(HOME_PAGE_HTML)}`;

export function isBrowserHomeUrl(url: string): boolean {
  return url === BROWSER_HOME_URL || url.startsWith("data:text/html");
}
