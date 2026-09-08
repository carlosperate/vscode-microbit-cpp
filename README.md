# BBC micro:bit C++

Build C++ programs for the BBC micro:bit with
[CODAL](https://github.com/lancaster-university/codal-microbit-v2), inside VS
Code, on the desktop and on the web 🤖.

The compiler is Clang, LLD and the binutils built as WebAssembly, so there is
no toolchain to install and no additional resources are downloaded at install
or build time: the whole toolchain ships inside the extension.

🚧 **Nothing works yet.** This is the project skeleton: the extension activates
on both hosts and contributes a **Build** command that tells you it is not
implemented. The compiler packages it will carry,
[`microbit-clang-wasm`](https://github.com/carlosperate/microbit-clang-wasm) and
[`microbit-clang-wasm-codal`](https://github.com/carlosperate/microbit-clang-wasm-codal),
exist and produce a hex byte-identical to the native Clang toolchain; wiring
them into this extension is the next step.

## Development

```sh
npm install
npm run build       # both bundles into dist/
npm run typecheck   # src/, src/node/ and test/ are three projects
npm test            # vitest, no editor needed
npm run chrome      # VS Code Web in Chromium, extension loaded from source
npm run serve       # the same, served on :3000 for a browser of your own
npm run desktop     # desktop VS Code, isolated profile, node bundle
```

## Licence

MIT, see [LICENSE](LICENSE).

Once the toolchain ships inside the extension, this section also reproduces the
notices of everything it carries: LLVM, libc++ and compiler-rt (Apache-2.0 with
LLVM exception), newlib, YoWASP (ISC), CODAL (MIT) and the Nordic SDK objects
under Nordic's own licence.
