const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');

const userscript = readFileSync(join(__dirname, '..', 'reddit-frontend-switcher.user.js'), 'utf8');

function makeElement(tagName) {
  const listeners = new Map();
  const element = {
    tagName,
    style: {},
    children: [],
    isConnected: false,
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    dispatch(name) { listeners.get(name)?.(); },
    appendChild(child) { this.children.push(child); child.isConnected = true; },
    attachShadow() { this.shadowRoot = makeElement('shadow-root'); return this.shadowRoot; },
  };
  return element;
}

function visit(href, storage = new Map()) {
  const menus = [];
  const events = new Map();
  const body = makeElement('body');
  const document = {
    readyState: 'loading',
    body,
    createElement: makeElement,
    getElementById(id) { return body.children.find((child) => child.id === id) || null; },
    addEventListener(name, callback) { events.set(name, callback); },
  };
  let redirect = null;
  const location = {
    href,
    replace(target) { redirect = target; },
  };
  runInNewContext(userscript, {
    URL,
    location,
    document,
    GM_getValue(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
    GM_setValue(key, value) { storage.set(key, value); },
    GM_registerMenuCommand(label, callback) { menus.push({ label, callback }); },
  }, { filename: 'reddit-frontend-switcher.user.js' });

  return {
    get redirect() { return redirect; },
    storage,
    menus,
    body,
    mount() { events.get('DOMContentLoaded')?.(); },
    clickToggle() {
      this.mount();
      const toggle = body.children.find((child) => child.id === 'reddit-frontend-switcher');
      assert.ok(toggle, 'toggle should be mounted');
      toggle.shadowRoot.children[0].dispatch('click');
      return toggle.shadowRoot.children[0];
    },
  };
}

test('first visit respects existing frontend and shows a toggle', () => {
  const page = visit('https://www.reddit.com/r/cats/');
  assert.equal(page.redirect, null);
  const button = page.clickToggle();
  assert.equal(button.textContent, '↔ Old Reddit');
  assert.equal(page.storage.get('preferredFrontend'), 'old');
  assert.equal(page.redirect, 'https://old.reddit.com/r/cats/');
});

test('switching from old preserves path, query parameters, and fragment', () => {
  const page = visit('https://old.reddit.com/r/javascript/comments/abc/title/?sort=new#t1_xyz');
  const button = page.clickToggle();
  assert.equal(button.textContent, '↔ Current Reddit');
  assert.equal(page.storage.get('preferredFrontend'), 'current');
  assert.equal(page.redirect, 'https://www.reddit.com/r/javascript/comments/abc/title/?sort=new#t1_xyz');
});

test('saved choice persists across page navigation', () => {
  const storage = new Map();
  visit('https://www.reddit.com/r/a/', storage).clickToggle();
  const onWrongHost = visit('https://www.reddit.com/r/b/?f=1#comments', storage);
  assert.equal(onWrongHost.redirect, 'https://old.reddit.com/r/b/?f=1#comments',
    'an attempt on a different path should not block navigation');
  const onOld = visit('https://old.reddit.com/r/b/?f=1#comments', storage);
  assert.equal(onOld.redirect, null);
  assert.equal(storage.get('pendingRedirect'), null, 'arriving at target clears loop guard');
  const onAnotherPage = visit('https://www.reddit.com/r/b/?f=1#comments', storage);
  assert.equal(onAnotherPage.redirect, 'https://old.reddit.com/r/b/?f=1#comments');
});

test('saved current choice redirects old links to www', () => {
  const storage = new Map([['preferredFrontend', 'current']]);
  const page = visit('https://old.reddit.com/r/programming/?sort=top', storage);
  assert.equal(page.redirect, 'https://www.reddit.com/r/programming/?sort=top');
  assert.equal(storage.get('pendingRedirect').target, 'current');
});

test('the current frontend includes sh.reddit.com', () => {
  const storage = new Map([['preferredFrontend', 'current']]);
  const page = visit('https://sh.reddit.com/r/test/', storage);
  assert.equal(page.redirect, null);
  assert.equal(page.clickToggle().textContent, '↔ Old Reddit');
});

test('no saved choice leaves old.reddit.com alone', () => {
  const page = visit('https://old.reddit.com/r/test/');
  assert.equal(page.redirect, null);
  assert.equal(page.menus[0].label, 'Switch to Current Reddit');
});

test('authentication and API paths are excluded from redirects and UI', () => {
  const storage = new Map([['preferredFrontend', 'old']]);
  for (const path of ['/login/', '/register', '/logout', '/password/reset', '/verify', '/authorize?client_id=x', '/oauth/authorize', '/api/v1/me', '/graphql']) {
    const page = visit(`https://www.reddit.com${path}`, storage);
    page.mount();
    assert.equal(page.redirect, null, `unexpected redirect for ${path}`);
    assert.equal(page.body.children.length, 0, `unexpected toggle for ${path}`);
  }
});

test('fresh redirect guard prevents a forced-server-redirect loop', () => {
  const storage = new Map([['preferredFrontend', 'old']]);
  const initial = visit('https://www.reddit.com/r/example/', storage);
  assert.equal(initial.redirect, 'https://old.reddit.com/r/example/');
  // Simulate Old Reddit immediately redirecting back to www before scripts run.
  const bounced = visit('https://www.reddit.com/r/example/', storage);
  assert.equal(bounced.redirect, null);
  assert.equal(bounced.menus[0].label, 'Switch to Old Reddit');
});

test('an expired redirect guard does not suppress new navigation', () => {
  const storage = new Map([
    ['preferredFrontend', 'old'],
    ['pendingRedirect', { target: 'old', route: '/r/example/', at: Date.now() - 21_000 }],
  ]);
  const page = visit('https://www.reddit.com/r/example/', storage);
  assert.equal(page.redirect, 'https://old.reddit.com/r/example/');
});

test('menu command switches frontend without needing the button', () => {
  const page = visit('https://www.reddit.com/r/test/');
  page.menus[0].callback();
  assert.equal(page.redirect, 'https://old.reddit.com/r/test/');
  assert.equal(page.storage.get('preferredFrontend'), 'old');
});

test('clearing the saved preference disables future automatic redirection', () => {
  const storage = new Map([['preferredFrontend', 'old']]);
  const old = visit('https://old.reddit.com/', storage);
  old.menus[1].callback();
  assert.equal(storage.get('preferredFrontend'), null);
  assert.equal(visit('https://www.reddit.com/', storage).redirect, null);
});

test('toggle is only inserted once if mount is called twice', () => {
  const page = visit('https://www.reddit.com/');
  page.mount();
  page.mount();
  assert.equal(page.body.children.length, 1);
});
