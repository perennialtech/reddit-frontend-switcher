// ==UserScript==
// @name         Reddit Frontend Switcher
// @namespace    https://github.com/perennialtech/reddit-frontend-switcher
// @version      1.0.0
// @description  Switch between Old Reddit and current Reddit, remembering your choice across navigation.
// @author       perennialtech
// @match        https://reddit.com/*
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://sh.reddit.com/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @updateURL    https://raw.githubusercontent.com/perennialtech/reddit-frontend-switcher/master/reddit-frontend-switcher.user.js
// @downloadURL  https://raw.githubusercontent.com/perennialtech/reddit-frontend-switcher/master/reddit-frontend-switcher.user.js
// ==/UserScript==

(function () {
  'use strict';

  const PREFERENCE_KEY = 'preferredFrontend';
  const REDIRECT_KEY = 'pendingRedirect';
  const REDIRECT_GUARD_MS = 20_000;
  const HOSTS = Object.freeze({ old: 'old.reddit.com', current: 'www.reddit.com' });

  // These routes are authentication/API endpoints, not interchangeable frontends.
  const EXCLUDED_ROOTS = new Set([
    'login', 'register', 'logout', 'password', 'verify', 'authorize',
    'oauth', 'api', 'graphql',
  ]);

  const initialUrl = new URL(location.href);
  const current = initialUrl.hostname === HOSTS.old ? 'old' : 'current';
  const other = current === 'old' ? 'current' : 'old';
  const preference = GM_getValue(PREFERENCE_KEY, null);
  const routeKey = initialUrl.pathname + initialUrl.search;

  function destination(mode) {
    const url = new URL(location.href);
    url.hostname = HOSTS[mode];
    return url.href;
  }

  function switchTo(mode) {
    GM_setValue(PREFERENCE_KEY, mode);
    GM_setValue(REDIRECT_KEY, { target: mode, route: routeKey, at: Date.now() });
    location.replace(destination(mode));
  }

  // In particular, don't turn a login or OAuth callback into an Old Reddit URL.
  const rootSegment = initialUrl.pathname.split('/')[1].toLowerCase();
  if (EXCLUDED_ROOTS.has(rootSegment)) return;

  const pending = GM_getValue(REDIRECT_KEY, null);
  if (preference === current) {
    // We successfully reached the requested frontend: the next redirect is safe.
    if (pending && pending.target === preference) {
      GM_setValue(REDIRECT_KEY, null);
    }
  } else if (preference === 'old' || preference === 'current') {
    // Reddit can force a host back (for example when Old Reddit is unavailable).
    // A short shared-storage guard stops the ensuing cross-host redirect loop.
    const elapsed = pending && Date.now() - pending.at;
    const recentlyAttempted = pending && pending.target === preference &&
      pending.route === routeKey &&
      Number.isFinite(elapsed) && elapsed >= 0 && elapsed < REDIRECT_GUARD_MS;

    if (!recentlyAttempted) {
      switchTo(preference);
      return;
    }
  }

  function frontendLabel(mode) {
    return mode === 'old' ? 'Old Reddit' : 'Current Reddit';
  }

  GM_registerMenuCommand(`Switch to ${frontendLabel(other)}`, () => switchTo(other));
  GM_registerMenuCommand('Clear saved frontend preference', () => {
    GM_setValue(PREFERENCE_KEY, null);
    GM_setValue(REDIRECT_KEY, null);
  });

  function mountToggle() {
    if (!document.body || document.getElementById('reddit-frontend-switcher')) return;

    const host = document.createElement('div');
    host.id = 'reddit-frontend-switcher';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';

    // Keep Reddit's CSS from restyling the toggle on either frontend.
    const shadow = host.attachShadow({ mode: 'open' });
    const button = document.createElement('button');
    const label = `Switch to ${frontendLabel(other)}`;
    button.type = 'button';
    button.textContent = `↔ ${frontendLabel(other)}`;
    button.title = `${label} (remember choice)`;
    button.setAttribute('aria-label', label);
    button.style.cssText = [
      'all:initial',
      'box-sizing:border-box',
      'display:inline-block',
      'padding:10px 14px',
      'border:1px solid #777',
      'border-radius:999px',
      'background:#202124',
      'color:#fff',
      'font:600 13px/1.25 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 2px 10px rgba(0,0,0,.25)',
      'cursor:pointer',
    ].join(';');
    button.addEventListener('click', () => switchTo(other));
    shadow.appendChild(button);
    document.body.appendChild(host);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggle, { once: true });
  } else {
    mountToggle();
  }
})();
