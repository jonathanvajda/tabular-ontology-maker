# Glide Migration Checklist

## Tooling
- [x] Add root `package.json` for `Vite + React + TypeScript`
- [x] Add root Jest config for typed unit and jsdom tests
- [x] Add `index.html` source entrypoint for the React app
- [ ] Install dependencies and run the first local build

## Source App
- [x] Add typed ontology row/schema models
- [x] Extract pure ontology helpers and grid patch logic
- [x] Add vocabulary index service
- [x] Add IndexedDB storage helpers
- [x] Add RDF generation helpers
- [x] Add spreadsheet and ontology import helpers
- [x] Add React app shell and Glide grid component
- [ ] Verify Glide-specific editor behavior against the live package API

## Static Assets
- [x] Add `public/` vendor copies for `n3.min.js` and `xlsx.full.min.js`
- [x] Add `public/manifest.json` and image assets for the Vite app
- [x] Normalize manifest paths for Pages deployment
- [ ] Build to `docs/` and replace Handsontable runtime entrypoints

## Tests
- [x] Replace placeholder tests with real ontology/helper coverage
- [x] Add a jsdom smoke test around the Glide grid wrapper
- [ ] Run Jest and fix any type or runtime issues
- [ ] Add browser-level spreadsheet interaction checks after the first build

## Acceptance
- [ ] `vite build` emits the new app into `docs/`
- [ ] `docs/index.html` runs the Glide app instead of Handsontable
- [ ] PWA shell still registers and loads offline assets correctly
- [ ] Import, export, save-session, and predicate flows behave at parity with the tested HOT baseline
