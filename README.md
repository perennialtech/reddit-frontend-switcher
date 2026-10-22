# reddit-frontend-switcher

A lightweight [Tampermonkey](https://www.tampermonkey.net/) userscript for switching between **Old Reddit** (`old.reddit.com`) and **Current Reddit** (`www.reddit.com`). Your chosen frontend follows you across Reddit pages, refreshes, and browser restarts.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or a compatible userscript manager).
2. **[Install reddit-frontend-switcher.user.js](https://raw.githubusercontent.com/perennialtech/reddit-frontend-switcher/master/reddit-frontend-switcher.user.js)** and approve the userscript installation.
3. Open Reddit. Use the small **↔ Old Reddit** or **↔ Current Reddit** button in the bottom-right corner.

The installation link works once this file is published on the repository's `master` branch. The userscript declares update and download URLs for updates through the userscript manager.

## Features

- **One-click switching:** use a floating button or the userscript manager's menu.
- **Persistent preference:** choose a frontend once; it is automatically applied to subsequent Reddit pages, including links opened in new tabs.
- **Same page when switching:** preserves the path, query string, and `#fragment` when changing domains.
- **Minimal redirect flicker:** runs at `document-start` and uses `location.replace()` to avoid polluting Back history with intermediate redirects.
- **Redirect-loop protection:** avoids repeatedly bouncing between hosts if Reddit forces you back to the other frontend.
- **Safe auth handling:** skips login, registration, logout, OAuth, and API endpoints rather than rewriting those URLs.
- **No dependencies, analytics, or external requests** apart from normal browser navigation to Reddit.

## How it works

On your first visit, the script **does not force a frontend**. Click its button to choose the opposite of the one you're using. The script saves `old` or `current` using Tampermonkey's `GM_setValue`, which is shared across the domains listed in the script's metadata.

When a new page loads, the script checks your saved preference and, when needed, replaces just the URL hostname:

```text
https://www.reddit.com/r/example/comments/abc/title/?sort=new#comment-123
                            ↕
https://old.reddit.com/r/example/comments/abc/title/?sort=new#comment-123
```

`reddit.com` and `sh.reddit.com` are treated as the current frontend. Switching **to** the current frontend always opens `www.reddit.com`.

**Resetting:** In your userscript manager's menu, select **Clear saved frontend preference**. This removes the saved selection; it does not change the page you're currently viewing.

## Limitations

- Changing between Reddit domains requires a page navigation. A userscript cannot transform one interface into the other without loading that frontend.
- Reddit may redirect away from Old Reddit, especially when signed out, or may not support certain modern-only pages there. The loop guard prevents endless redirects, but cannot bypass Reddit's server-side restrictions. If a host is unavailable, use the toggle to switch back.
- Browser or Reddit behavior may change. Tested behavior in this repository is primarily covered by automated URL and state tests, not live end-to-end tests against Reddit.
- The script applies to `https://reddit.com`, `https://www.reddit.com`, `https://old.reddit.com`, and `https://sh.reddit.com` only. It intentionally does not alter unrelated Reddit subdomains.

## Development

Requires Node.js 20 or newer; no dependencies need to be installed.

```bash
npm test
```

Tests run the userscript in a sandboxed mock browser, including preference persistence, matching routes, query/fragment preservation, authentication exclusions, and forced-redirect loop protection.

## License

MIT. See [LICENSE](LICENSE).
