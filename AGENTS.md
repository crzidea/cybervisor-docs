# cybervisor-docs Agent Guide

## Project Overview

`cybervisor-docs` builds a static VitePress site from `../cybervisor/docs/` and deploys the output to Cloudflare Workers Static Assets. It does not host product logic, APIs, or dynamic Worker code.

## Development Commands

```bash
npm install
npm run sync
npm run dev
npm run build
npm run preview
npm run deploy
```

Run `npm run sync` after cloning and before `npm run dev` or `npm run build`. The copied `docs/` tree is gitignored.

## Documentation Source

- Edit Markdown only in `../cybervisor/docs/`.
- Never edit generated files under `cybervisor-docs/docs/`; they are overwritten by `npm run sync`.
- When adding or renaming pages under `cybervisor/docs/`, update navigation in `.vitepress/config.mjs` so the sidebar and top nav stay complete.

## Documentation

- `README.md`: First-run setup, sync workflow, link rewriting, Wrangler deploy, and optional `docs.cybervisor.ai` route.
- `scripts/sync-docs.js`: Copies source docs, removes stale copies, rewrites cross-repo links, and copies `public/` assets into the site tree.

## Rules

- Do not change canonical Cybervisor product documentation in `cybervisor/docs/` unless the task requires it for site compatibility.
- Keep deployment configuration inside this subproject; do not add root-level CI or Wrangler config.
- Leave the `docs.cybervisor.ai` route disabled in `wrangler.toml` until DNS and Cloudflare zone ownership are confirmed.
