import type { BrowserLocale } from "../../shared/types.js";

const HOME_MARKER = "#coolto-browser-home";

interface HomeCopy {
  brand: string;
  hint: string;
  placeholder: string;
}

export function browserHomeUrl(
  theme: "light" | "dark",
  locale: BrowserLocale,
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
        <input id="q" type="text" autofocus autocomplete="off"
          placeholder="${copy.placeholder}" aria-label="${copy.placeholder}" />
      </div>
      <p class="hint">${copy.hint}</p>
    </form>
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
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}${HOME_MARKER}`;
}

export function isBrowserHomeUrl(url: string): boolean {
  return url.endsWith(HOME_MARKER);
}

function homeCopy(locale: BrowserLocale): HomeCopy {
  return locale === "en-US"
    ? {
        brand: "Coolto Browser",
        hint: "Press Enter to search with Bing",
        placeholder: "Search or enter a web address",
      }
    : {
        brand: "Coolto 浏览器",
        hint: "按 Enter 使用 Bing 搜索",
        placeholder: "搜索或输入网址",
      };
}
