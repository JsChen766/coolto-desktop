/** Accessible review UI and reversible layout lifecycle executed in the page. */
export const OVERLAY_UI_RUNTIME_SCRIPT = `
  const mask = make('div', { id: MASK_ID, 'aria-hidden': 'true' });
  const toolbar = make('section', {
    id: TOOLBAR_ID, role: 'region', 'aria-label': COPY.region, tabindex: '-1',
  });
  const copy = make('div', { class: '__coolto-review-copy' });
  const title = make('span', { class: '__coolto-review-title' }, COPY.title);
  copy.append(title);
  const progress = make('span', {
    class: '__coolto-review-progress', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  copy.append(progress);
  const acceptAll = make('button', {
    type: 'button', class: 'primary', 'data-action': 'accept-all', 'aria-label': COPY.acceptAll,
  }, COPY.acceptAll);
  const rejectAll = make('button', {
    type: 'button', class: 'danger', 'data-action': 'reject-all', 'aria-label': COPY.rejectAll,
  }, COPY.rejectAll);
  toolbar.append(copy, acceptAll, rejectAll);
  document.body.append(mask, toolbar);
  const styleFailures = await waitForOverlayStyles(mask, toolbar);
  if (styleFailures.length) {
    mask.remove(); toolbar.remove(); delete window[STATE_KEY];
    return { ok: false, reason: 'style_blocked:' + styleFailures.join(',') };
  }
  state.mask = mask;
  state.toolbar = toolbar;
  state.title = title;
  state.progress = progress;
  state.acceptAll = acceptAll;
  state.rejectAll = rejectAll;

  const entries = [];
  const markBadge = (entry, decision) => {
    entry.badge.classList.remove('done-accept', 'done-reject');
    if (decision === 'accepted') entry.badge.classList.add('done-accept');
    if (decision === 'rejected') entry.badge.classList.add('done-reject');
    entry.accept.setAttribute('aria-pressed', String(decision === 'accepted'));
    entry.reject.setAttribute('aria-pressed', String(decision === 'rejected'));
    entry.decision.textContent = decision === 'accepted' ? COPY.accepted
      : decision === 'rejected' ? COPY.rejected : COPY.pending;
  };
  const updateProgress = () => {
    const values = Object.values(state.decisions);
    const done = values.filter((value) => value !== 'pending').length;
    progress.textContent = COPY.progress.replace('{done}', String(done))
      .replace('{total}', String(values.length));
  };
  const setDecision = (entry, decision) => {
    state.decisions[entry.record.fillId] = decision;
    markBadge(entry, decision);
    updateProgress();
    const ids = Object.keys(state.decisions);
    if (ids.length && ids.every((id) => state.decisions[id] !== 'pending') && !state.globalAction) {
      state.globalAction = 'auto';
    }
  };
  const trustedButton = (event, button, text, className, minWidth) => {
    if (!event.isTrusted || !button.isConnected || button.textContent !== text
      || button.children.length !== 0 || button.getAttribute('aria-label') !== text
      || button.className !== className) return false;
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible'
      && style.pointerEvents === 'auto' && style.opacity === '1'
      && rect.width >= minWidth && rect.height >= 28;
  };
  for (const [index, record] of RECORDS.entries()) {
    const element = findField(record.fillId);
    if (!element) continue;
    const badge = make('div', {
      [BADGE_ATTR]: record.fillId, role: 'group',
      'aria-label': COPY.field + (record.label || String(index + 1)),
    });
    const accept = make('button', {
      type: 'button', class: 'accept', 'aria-label': COPY.accept,
    }, COPY.accept);
    const reject = make('button', {
      type: 'button', class: 'reject', 'aria-label': COPY.reject,
    }, COPY.reject);
    const decision = make('span', { class: '__coolto-review-decision' }, COPY.pending);
    badge.append(accept, reject, decision);
    document.body.appendChild(badge);
    const entry = { badge, element, record, index, accept, reject, decision };
    accept.addEventListener('click', (event) => {
      if (trustedButton(event, accept, COPY.accept, 'accept', 44)) {
        setDecision(entry, 'accepted');
      }
    });
    reject.addEventListener('click', (event) => {
      if (!trustedButton(event, reject, COPY.reject, 'reject', 44)) return;
      rejectValue(record); setDecision(entry, 'rejected');
    });
    markBadge(entry, 'pending');
    entries.push(entry);
  }
  state.entries = entries;

  const positionEntry = (entry) => {
    entry.element = findField(entry.record.fillId) || entry.element;
    if (!entry.element || !entry.element.isConnected) { entry.badge.hidden = true; return; }
    const rect = entry.element.getBoundingClientRect();
    const width = entry.badge.offsetWidth || 150;
    const height = entry.badge.offsetHeight || 34;
    const gap = 6;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const offscreen = rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0
      || rect.top >= viewportHeight || rect.left >= viewportWidth;
    if (offscreen) { entry.badge.hidden = true; return; }
    entry.badge.hidden = false;
    const candidates = [
      { top: rect.top + (rect.height - height) / 2, left: rect.right + gap },
      { top: rect.top + (rect.height - height) / 2, left: rect.left - width - gap },
      { top: rect.top - height - gap, left: rect.left },
      { top: rect.bottom + gap, left: rect.left },
    ];
    const inside = (point) => point.left >= 0 && point.left + width <= viewportWidth
      && point.top >= 0 && point.top + height <= viewportHeight;
    const point = candidates.find(inside) || candidates[0];
    entry.badge.style.top = window.scrollY + Math.max(0, point.top) + 'px';
    entry.badge.style.left = window.scrollX
      + Math.max(0, Math.min(point.left, viewportWidth - width)) + 'px';
  };
  let animationFrame = 0;
  const relayout = () => { animationFrame = 0; for (const entry of entries) positionEntry(entry); };
  const scheduleRelayout = () => {
    if (!animationFrame) animationFrame = requestAnimationFrame(relayout);
  };
  const syncToolbarOffset = () => {
    const height = Math.ceil(toolbar.getBoundingClientRect().height) || 48;
    document.body.style.paddingTop = 'calc(' + baseBodyPaddingTop + ' + ' + height + 'px)';
    scheduleRelayout();
  };
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(syncToolbarOffset) : null;
  const mutationObserver = typeof MutationObserver === 'function'
    ? new MutationObserver(scheduleRelayout) : null;

  const reviewControls = () => Array.from(document.querySelectorAll(
    '#' + TOOLBAR_ID + ' button,[' + BADGE_ATTR + '] button',
  )).filter((element) => !element.disabled && element.offsetParent !== null);
  const trapTab = (event) => {
    if (event.key !== 'Tab') return;
    const controls = reviewControls();
    if (!controls.length) { event.preventDefault(); toolbar.focus({ preventScroll: true }); return; }
    const index = controls.indexOf(document.activeElement);
    if (index < 0 || (!event.shiftKey && index === controls.length - 1)
      || (event.shiftKey && index === 0)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length - 1 : 0].focus({ preventScroll: true });
    }
  };
  acceptAll.addEventListener('click', (event) => {
    if (!trustedButton(event, acceptAll, COPY.acceptAll, 'primary', 64)) return;
    for (const entry of entries) {
      if (state.decisions[entry.record.fillId] !== 'rejected') setDecision(entry, 'accepted');
    }
    state.globalAction = 'accept_all';
  });
  rejectAll.addEventListener('click', (event) => {
    if (!trustedButton(event, rejectAll, COPY.rejectAll, 'danger', 64)) return;
    for (const entry of entries) { restoreValue(entry.record); setDecision(entry, 'rejected'); }
    state.globalAction = 'reject_all';
  });
  let cleaned = false;
  state.cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('scroll', scheduleRelayout, true);
    window.removeEventListener('resize', scheduleRelayout);
    window.removeEventListener('keydown', trapTab, true);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    if (animationFrame) cancelAnimationFrame(animationFrame);
    mask.remove(); toolbar.remove();
    for (const entry of entries) entry.badge.remove();
    document.body.style.paddingTop = previousBodyPaddingTop;
    state.mask = null; state.toolbar = null; state.title = null; state.progress = null;
    state.acceptAll = null; state.rejectAll = null; state.entries = [];
    try {
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    } catch { /* focus restoration is best effort */ }
  };
  resizeObserver?.observe(toolbar);
  mutationObserver?.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('scroll', scheduleRelayout, true);
  window.addEventListener('resize', scheduleRelayout);
  window.addEventListener('keydown', trapTab, true);
  updateProgress(); syncToolbarOffset();
  toolbar.focus({ preventScroll: true });
  return { ok: true, injectedCount: entries.length };
`;
