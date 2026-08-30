export type BrowserOverlayTheme = "light" | "dark";

interface OverlayStyleInput {
  maskId: string;
  toolbarId: string;
  badgeAttr: string;
  theme: BrowserOverlayTheme;
}

// Synchronized with renderer tokens.css because external pages cannot consume
// the renderer's CSS variables safely.
const THEMES = {
  light: {
    scheme: "light", bg: "#f1f1ef", raised: "#ffffff", hover: "#ececea",
    active: "#e7e7e3", border: "#e3e3df", borderStrong: "#d6d5d0",
    text: "#20201e", soft: "#4a4944", accent: "#356fca",
    danger: "#b14c4c", success: "#2f7650",
    mask: "rgba(15,23,42,.12)", shadow: "rgba(37,36,31,.18)",
  },
  dark: {
    scheme: "dark", bg: "#252523", raised: "#30302d", hover: "#2b2b28",
    active: "#30302d", border: "#373733", borderStrong: "#494943",
    text: "#edede8", soft: "#b5b2aa", accent: "#78a7f5",
    danger: "#e58b8b", success: "#78c596",
    mask: "rgba(0,0,0,.28)", shadow: "rgba(0,0,0,.32)",
  },
} as const;

/** Trusted review chrome only. The host page keeps its own visual system. */
export function buildOverlayStyleText(input: OverlayStyleInput): string {
  const t = THEMES[input.theme];
  const mask = `#${input.maskId}`;
  const toolbar = `#${input.toolbarId}`;
  const badge = `[${input.badgeAttr}]`;
  return `
${mask}{--coolto-review-style:mask;position:fixed!important;inset:0!important;z-index:2147483000!important;
  display:block!important;background:${t.mask}!important;pointer-events:auto!important;visibility:visible!important;
  opacity:1!important;transform:none!important;scale:1!important;clip-path:none!important}
${toolbar}{--coolto-review-style:toolbar;position:fixed!important;top:0!important;left:0!important;right:0!important;
  z-index:2147483647!important;box-sizing:border-box!important;display:flex!important;
  flex-wrap:wrap;gap:8px;align-items:center;width:100%;padding:8px 12px;
  border:0;border-bottom:1px solid ${t.border}!important;background:${t.bg}!important;color:${t.text}!important;
  pointer-events:auto!important;visibility:visible!important;opacity:1!important;transform:none!important;scale:1!important;zoom:1!important;
  font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:${t.scheme}}
${toolbar} .__coolto-review-copy{display:flex;flex:1 1 320px;align-items:baseline;gap:8px;min-width:0}
${toolbar} .__coolto-review-title{font-weight:600}
${toolbar} .__coolto-review-progress{color:${t.soft};font-variant-numeric:tabular-nums;white-space:nowrap}
${toolbar} button,${badge} button{box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;
  justify-content:center!important;min-width:44px!important;min-height:30px!important;width:auto!important;height:auto!important;
  max-width:none!important;border:1px solid ${t.borderStrong}!important;border-radius:6px!important;
  background:${t.raised}!important;color:${t.text}!important;cursor:pointer!important;pointer-events:auto!important;
  visibility:visible!important;opacity:1!important;transform:none!important;scale:1!important;zoom:1!important;text-indent:0!important;
  position:relative!important;inset:auto!important;clip:auto!important;clip-path:none!important;filter:none!important;
  font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif!important;white-space:nowrap!important}
${toolbar} button::before,${toolbar} button::after,${badge} button::before,${badge} button::after{
  content:none!important;display:none!important}
${toolbar} button{min-width:64px!important;padding:7px 11px!important}
${toolbar} button:hover,${badge} button:hover{background:${t.hover}}
${toolbar} button:active,${badge} button:active{background:${t.active}}
${toolbar} button:focus-visible,${badge} button:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
${toolbar} button.primary{border-color:${t.accent}!important;background:${t.accent}!important;color:${input.theme === "dark" ? "#1b1b19" : "#ffffff"}!important}
${toolbar} button.danger,${badge} button.reject{border-color:${t.danger}!important;background:${t.raised}!important;color:${t.danger}!important}
${toolbar} button.primary:hover{filter:brightness(.92)}
${toolbar} button.danger:hover,${badge} button.reject:hover{background:${t.hover}}
${badge}{position:absolute!important;z-index:2147483001!important;box-sizing:border-box;display:flex!important;align-items:center;gap:3px;
  padding:3px;border:1px solid ${t.borderStrong};border-radius:8px;background:${t.raised};color:${t.text};
  box-shadow:0 2px 6px ${t.shadow};pointer-events:auto!important;visibility:visible!important;opacity:1!important;
  transform:none!important;scale:1!important;zoom:1!important;font:12px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
  transition:border-color 120ms ease,background-color 120ms ease}
${badge}[hidden]{display:none!important}${badge} button{padding:5px 7px!important}
${badge} .__coolto-review-decision{padding:0 5px;color:${t.soft};white-space:nowrap}
${badge}.done-accept{border-color:${t.success};background:${t.bg}}
${badge}.done-accept .__coolto-review-decision{color:${t.success}}
${badge}.done-reject{border-color:${t.danger};background:${t.bg}}
${badge}.done-reject .__coolto-review-decision{color:${t.danger}}
@media (max-width:520px){${toolbar} .__coolto-review-copy{flex-basis:100%}${toolbar} button{flex:1 1 auto}}
@media (prefers-reduced-motion:reduce){${badge}{transition:none}}
@media (forced-colors:active){${mask}{background:transparent}${toolbar},${badge}{border:1px solid CanvasText}}
`;
}
