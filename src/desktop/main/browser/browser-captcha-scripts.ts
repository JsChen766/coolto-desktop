/**
 * B4: 验证码/滑块检测探针。在页面上扫一遍已知的验证码组件特征，
 * 命中任一即返回 { kind, detail }。轮询时若返回同一 kind 不重复上抛。
 */
export function buildCaptchaProbeScript(): string {
  return `(() => {
  const found = [];
  const push = (kind, detail) => found.push({ kind, detail: (detail || '').slice(0, 200) });
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };

  document.querySelectorAll('iframe[src]').forEach((f) => {
    const src = f.getAttribute('src') || '';
    if (!visible(f)) return;
    if (/recaptcha|google\\.com\\/recaptcha/i.test(src)) push('recaptcha', src);
    else if (/hcaptcha/i.test(src)) push('hcaptcha', src);
    else if (/geetest/i.test(src)) push('geetest', src);
  });
  document.querySelectorAll('.g-recaptcha,[data-sitekey]').forEach((el) => {
    if (visible(el)) push('recaptcha', el.className || 'recaptcha');
  });
  document.querySelectorAll('.geetest_holder,.geetest_panel,.geetest_btn').forEach((el) => {
    if (visible(el)) push('geetest', el.className || 'geetest');
  });
  const slider = document.querySelector('[class*="slider-verify"],[class*="nc_wrapper"],[class*="verify-slide"],[class*="captcha-slider"]');
  if (slider && visible(slider)) push('slider', slider.className || 'slider');
  const imgCap = document.querySelector('img[src*="captcha" i],img[alt*="captcha" i],img[alt*="验证码"]');
  if (imgCap && visible(imgCap)) push('image', imgCap.getAttribute('src') || 'image-captcha');

  return found[0] || null;
})();`;
}
