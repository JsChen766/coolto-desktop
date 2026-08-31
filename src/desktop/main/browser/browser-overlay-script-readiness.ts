import { OVERLAY_VIEWPORT_RUNTIME_SCRIPT } from "./browser-overlay-viewport.js";

/** Bounded renderer-side wait for host-injected CSS to reach computed style. */
export const OVERLAY_STYLE_READINESS_SCRIPT = `
${OVERLAY_VIEWPORT_RUNTIME_SCRIPT}
  const readOverlayStyleFailures = (mask, toolbar) => {
    const maskStyle = getComputedStyle(mask);
    const toolbarStyle = getComputedStyle(toolbar);
    const maskRect = mask.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const failures = [];
    const expectStyle = (name, actual, expected) => {
      if (actual !== expected) failures.push(name + '=' + String(actual));
    };
    expectStyle('mask.position', maskStyle.position, 'fixed');
    expectStyle('toolbar.position', toolbarStyle.position, 'fixed');
    expectStyle('mask.pointer', maskStyle.pointerEvents, 'auto');
    expectStyle('toolbar.pointer', toolbarStyle.pointerEvents, 'auto');
    expectStyle('mask.z', maskStyle.zIndex, '2147483000');
    expectStyle('toolbar.z', toolbarStyle.zIndex, '2147483647');
    expectStyle('mask.display', maskStyle.display, 'block');
    expectStyle('toolbar.display', toolbarStyle.display, 'flex');
    expectStyle('mask.visibility', maskStyle.visibility, 'visible');
    expectStyle('toolbar.visibility', toolbarStyle.visibility, 'visible');
    expectStyle('mask.opacity', maskStyle.opacity, '1');
    expectStyle('toolbar.opacity', toolbarStyle.opacity, '1');
    expectStyle('mask.marker', maskStyle.getPropertyValue('--coolto-review-style').trim(), 'mask');
    expectStyle('toolbar.marker', toolbarStyle.getPropertyValue('--coolto-review-style').trim(), 'toolbar');
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight = viewport?.height ?? document.documentElement.clientHeight;
    const viewportEdges = {
      left: viewportLeft, top: viewportTop,
      right: viewportLeft + viewportWidth, bottom: viewportTop + viewportHeight,
    };
    if (!browserOverlayRectCoversViewport(maskRect, viewportEdges, devicePixelRatio)) failures.push(
      'mask.width=' + maskRect.width + '/client=' + document.documentElement.clientWidth
      + '/visual=' + (window.visualViewport?.width ?? 'none') + '/dpr=' + devicePixelRatio,
    );
    if (!browserOverlayTopBarCoversViewport(
      toolbarRect, viewportEdges, devicePixelRatio,
    )) failures.push('toolbar.coverage');
    if (toolbarRect.height < 30) failures.push('toolbar.height=' + toolbarRect.height);
    return failures;
  };
  const nextOverlayStyleFrame = () => new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    const timer = setTimeout(finish, 50);
    requestAnimationFrame(() => { clearTimeout(timer); finish(); });
  });
  const waitForOverlayStyles = async (mask, toolbar) => {
    let failures = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      failures = readOverlayStyleFailures(mask, toolbar);
      if (!failures.length) return failures;
      if (attempt < 3) await nextOverlayStyleFrame();
    }
    return failures;
  };
`;
