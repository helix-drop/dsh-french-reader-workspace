# French Close Reading · Milestone 0

A DSH Host/Client plugin for reading French passages. The first vertical slice is deliberately small: create a passage, retrieve it through a generated Typert Remote API, and export the saved originals. Source text is immutable after creation; later stages will add paragraph/sentence segmentation, translations, grammar analysis, branches, and knowledge records without merging sibling discussion branches.

## Verified runtime contracts

Checked against the installed DSH `0.2.0-rc.2` artifacts (not only the docs):

| Surface | Verified fact |
|---|---|
| `client-modules` | Scans enabled Loader entries; a bundle resolves `require` against the frozen baseline table plus declared externals. Error text for a miss: `missed the module table`. |
| Module graph | A row declaring its own package in `dsh.client.external` is rejected (`a row must not declare its own package in dsh.client.external`). |
| Codecs | The client only checks `codec.mode === 'strict'`; `codec.create` and `result.decode` are optional and never called on the request path. |
| `ctx.remote.$mount(contribution)` | Takes the contribution only, returns the disposer; the plugin owns calling it on unload. |
| `main` slot | Declared `kind: 'keyed'`, so registration carries `key`. |
| `sidebar.panellist` slot | Declared `kind: 'list'`; entries contribute `id` (required), `order` (default `0`), `label`. |
| `ctx.layout.selectPanel(null)` | Allowed; a non-null id must name a registered main panel. |
| `ctx.locale` | Provides `register(ns, dictionaries)` and `bind(ns)`. |
| Host `TypertRemoteService` | `constructor(ctx, serviceKey, options?)`; registers the Cordis service and the Gateway binding. |
| Storage domain | `defineDomain`/`domainTable`/`DomainFacility.open`; tables expose `get`/`entries()`/`keys()`/`size`/`put`/`delete`; `DomainError.code` is the discriminant and `detail` carries `invalid-record` location; writes are durable-before-memory and emit `domain/changed`. |

Desktop crash recovery (`disableAllPlugins`) renames the profile patch to `cordis.patch.yml.bak-<epoch-ms>` and resets `dsh.profile.bundles` to the app's own templates. A client-bundle failure therefore also resets unrelated third-party bundle enablement; keep `client.js` boot-safe and the backup handy.

## Runtime contract

- Target runtime: DSH `0.2.0-rc.2`.
- Host state is owned by `ctx.storageDomain` in the `french_reader` per-record domain. No direct filesystem or session-log writes.
- `FrenchReaderController` exposes `listPassages`, `getPassage`, `createPassage`, `exportPassages`, `getSegmentation`, `saveTranslation`, `addBranch`, and `listAnalysis`. Host/Client descriptors are produced by `@deepseek-ai/dsh-typert-generator`; the UI mounts the generated contribution and calls `ctx.remote.frenchReader`.

## Reading model

Records live in the `records` table of the `french_reader` domain, one key per artifact:

| Key | Record | Mutability |
|---|---|---|
| `<passageId>` | `passage` | written once; the source text never changes |
| `<passageId>#segments` | `segments` | derived from the source, written once per `sourceRevision` |
| `<passageId>#analysis` | `analysis` | append-only translations and branches |

- **Anchors.** `passage` names the whole passage (the overall translation), `p2` a paragraph, `p2.s3` a sentence. `segmentSource()` splits the source on blank lines, then sentences on terminal runs (`.!?…`, with closing quotes), on dialogue dashes after a line break, and holds periods back for abbreviations, initials, and decimals. Ids are positional and meaningful only together with `sourceRevision` + `SEGMENTATION_REVISION`; every anchor carries absolute offsets into the original source. `getSegmentation` computes and persists them on first use, then replays the stored copy so stored `anchorId`s keep pointing at the same text, and every write validates its `anchorId` with `isKnownAnchor` first.
- **Translations are versions, not overwrites.** Each `saveTranslation` appends `{ id, anchorId, language, text, createdAt, operationId }`; retrying the same `operationId` is idempotent, and reusing it with different content is a conflict.
- **The discussion is a tree.** `addBranch` appends `{ id, parentId, anchorId, kind, title, body }` with `kind ∈ constituents | grammar | vocabulary | translation | note`. Siblings under one anchor stay independent, so per-sentence grammar and vocabulary notes live in their own branches rather than in one linear transcript. `parentId` must name an existing branch of the same passage, and the kind allowlist is enforced before storage.
- `MAX_BRANCHES = 1000` per passage; each branch add rewrites the analysis record, which is acceptable at that size and keeps the record self-contained.

## Model-facing tool

`apply` also registers one `french_reader` tool, so the agent can fill the model instead of only reading it: `list`, `save`, `read`, `translate`, `branch`, `analysis`. `save`/`read` return the anchors with their exact text; `translate` and `branch` write against an anchor id. The tool calls the same controller the Remote API uses — one storage owner, two entrances.

Deliberate limits, stated in the tool description so the model sees them:

- the tool persists decisions; it never calls a model itself;
- the source is immutable — a wrong source means a new passage, not an edit;
- pass the same `operationId` only to retry the same write;
- an invented `kind` is refused before storage, so the branch kinds stay a closed allowlist;
- uncertain analysis belongs in the branch body as a stated doubt, never as an invented classification.
- The initial passage record carries `sourceRevision: 1`, `segmentationRevision: 1`, and `status: 'source-only'`. It contains no translation or model-generated analysis yet.
- To recover a retry after a lost response or page refresh, the Client stores only a per-tab idempotency token and source fingerprint in `sessionStorage`; it does not store the French text there.
- Current prototype safeguards: 20,000 source characters per passage and 250 passages per profile. The panel pages through all saved entries and exports a full JSON backup.

## Client bundle constraint (do not regress)

`client.js` is loaded raw by the browser module loader and must resolve against the **baseline module table only** (React, Cordis, and the shell's static UI libraries). A client half may **not** require a subpath of its own package: the module table materializes a package's own subpaths only for in-box bundles, so `require('@local/french-close-reading/remote')` misses the table and fails the entire web boot (`web boot: 1 entry did not activate`), which the Desktop app reports as a fatal startup failure.

Consequences, all enforced by `test/client-bundle.test.mjs` and `test/manifest.test.mjs`:

- `dsh.client.external` must stay absent; a self-request is rejected by the module graph.
- The four strict Remote descriptors are inlined in `client.js`. The client only checks `codec.mode === 'strict'` and never calls a codec's `create`, so the inlined descriptors carry no zod schemas and the generated `lib/typert.remote-client.js` stays unused by the browser half.
- Bootstrap registration during `apply` was dropped: a failing client entry is fatal to the whole web boot.

## Build

From this workspace root, run `pnpm install --ignore-scripts`, `pnpm build`, then `pnpm --filter @local/french-close-reading test`. The build typechecks the Host face and emits strict Host/Client Remote descriptors. The sibling `packages/typert-protocol` package is a build-only type-identity bridge for the standalone generator; it is excluded from the pnpm workspace and plugin bundle, so the linked plugin resolves the real `0.2.0-rc.2` protocol peer. It must not be installed into a DSH profile.

## Verification plan

1. Install the built local bundle through DSH's Plugin Manager.
2. Confirm the French Close Reading panel appears and can call the mounted Remote namespace.
3. Save a passage, reload the DSH page, and confirm it remains available; use Export to keep a JSON backup.
4. Disable/remove the bundle and confirm its panel, namespace, and open storage domain are released cleanly.

This milestone does not yet provide translations, sentence-component labels, interactive phrase selection, branch isolation, vocabulary lookup, or grammar accumulation. Those remain the next implementation stages.
