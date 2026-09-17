# Developer Documentation


```sh
npm install
npm run build                    # the four bundles, the assets and the licences, into dist/
npm run build:icon               # render assets/icon.svg to the extension's 256×256 PNG
npm run typecheck                # src/, src/node/ and test/ are three projects
npm test                         # vitest, no editor needed
npm run test:integration         # the integration tests under VS Code for the Web, headless
npm run test:integration:desktop # the same tests under desktop VS Code
npm run chrome                   # VS Code for the Web in Chromium, extension loaded from source
npm run serve                    # the same, served on :3000 for a browser of your own
npm run desktop                  # desktop VS Code, isolated profile, node bundle
```

Every one of those loads the published BBC micro:bit Manager beside this
extension. `config/manager.mjs` unpacks it from Open VSX into
`.vscode-test/manager/` and each script runs it first, fetching again only when
the published version moves. This extension declares the manager in
`extensionDependencies`, so VS Code will not activate without it. Its types come
from the `vscode-bbcmicrobit-manager-api` package on npm.

The extension icon is edited in `assets/icon.svg`. After changing it, run
`npm run build:icon` and commit both the SVG and generated `assets/icon.png`.
The export uses Playwright's Chromium, available through `@vscode/test-web`;
if the browser is missing, install it with `npx playwright install chromium`.

The compiler runs in a worker on both hosts: a nested Web Worker on the web, a
`worker_threads` worker on the desktop. The extension host reads the shipped
`.wasm`, sysroot and CODAL payload through `vscode.workspace.fs` and hands the
bytes to the worker, which is what lets the same code run wherever VS Code does.

Both compiler packages come from npm, pinned to an exact version. They are
deliberately not on a range: the extension carries them inside the VSIX, so it
is re-released when either changes rather than resolving something new at
install time.
