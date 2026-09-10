# BBC micro:bit C++

Build C++ programs for the BBC micro:bit with
[CODAL](https://github.com/lancaster-university/codal-microbit-v2), inside VS
Code, on the desktop and on the web.

The compiler is Clang, LLD and the LLVM binutils built as WebAssembly, with Arm
Toolchain for Embedded's C and C++ libraries and CODAL prebuilt, and all of it
ships inside the extension. There is no toolchain to install and nothing is
downloaded when you build.

🚧 **Preview.** It builds one fixed CODAL version in one fixed configuration and
does not flash the board yet. See [the limits](#limits-of-this-preview).

## Using it

1. Open a folder that holds a `main.cpp`, or run **BBC micro:bit C++: Create
   Project** to get one.
2. Run **BBC micro:bit C++: Build** from the Command Palette.
3. `MICROBIT.hex` and `MICROBIT.map` appear beside your sources, and the
   compiler's output is in the **BBC micro:bit C++** output channel.
4. Copy `MICROBIT.hex` onto the `MICROBIT` drive to run it.

A build takes every `.cpp`, `.cc` and `.cxx` file under the folder, and every
header, minus what `files.exclude` hides and what the
`bbcmicrobit-cpp.build.exclude` setting lists. The default keeps out `.git`,
`node_modules`, `build` and `libraries`, so a
[microbit-v2-samples](https://github.com/lancaster-university/microbit-v2-samples)
checkout builds as it is: the CODAL it would fetch is already here. `.c` files
are refused for now rather than compiled as C++.

Starting a second build cancels the one running for that folder, and only the
newest build writes its outputs. A failed build removes the previous hex, so
what is beside your sources is always the program they describe.

## The desktop toolchain, without the toolchain

On a desktop you install `arm-none-eabi-gcc`, CMake, Ninja and Python, clone
`microbit-v2-samples`, and let its build fetch CODAL. This extension carries the
same two halves prebuilt: the compiler in
[`microbit-clang-wasm`](https://github.com/carlosperate/microbit-clang-wasm) and
CODAL with its build recipe in
[`microbit-clang-wasm-codal`](https://github.com/carlosperate/microbit-clang-wasm-codal).
The recipe is captured from CODAL's own CMake build with the Clang toolchain, so
the flags are the ones that build uses, and the hex it produces is byte for byte
the one the native Clang toolchain produces.

| Part | Version | Contains |
|---|---|---|
| `microbit-clang-wasm` | 21.11.0-alpha.1 | Clang, LLD and binutils from Arm Toolchain for Embedded 21.1.1, with its newlib-nano, libc++ and compiler-rt for the micro:bit's Cortex-M4 |
| `microbit-clang-wasm-codal` | 0.305.0-alpha.1 | CODAL v0.3.5 prebuilt in the default `microbit-v2-samples` configuration, its headers and sources, and the compile and link recipe |

## Limits of this preview

- **One CODAL version and one configuration.** `codal.json` cannot be changed
  yet; the configuration is the `microbit-v2-samples` default, with the
  SoftDevice present and the BLE stack off.
- **No flashing.** Copy the hex to the board yourself. Flashing over WebUSB and
  the `MICROBIT` drive comes next.
- **Errors are text in the output channel**, not markers in the editor.
- **Memory.** The compiler needs about 1 GB, and keeps it once the first build
  has run: the loaded compiler and its libraries stay in the worker so later
  builds start in well under a second. A machine with 4 GB or more is the
  practical floor. Reload the window to give the memory back.
- **Offline.** On the desktop everything is read from the installed extension, so
  it works offline from installation. On the web, VS Code fetches an extension's
  files when they are first needed, so the first build needs the connection and
  later ones depend on the browser's cache.

## Development

```sh
npm install
npm run build                    # the four bundles, the assets and the licences, into dist/
npm run typecheck                # src/, src/node/ and test/ are three projects
npm test                         # vitest, no editor needed
npm run test:integration         # the integration tests under VS Code for the Web, headless
npm run test:integration:desktop # the same tests under desktop VS Code
npm run chrome                   # VS Code for the Web in Chromium, extension loaded from source
npm run serve                    # the same, served on :3000 for a browser of your own
npm run desktop                  # desktop VS Code, isolated profile, node bundle
```

The compiler runs in a worker on both hosts: a nested Web Worker on the web, a
`worker_threads` worker on the desktop. The extension host reads the shipped
`.wasm`, sysroot and CODAL payload through `vscode.workspace.fs` and hands the
bytes to the worker, which is what lets the same code run wherever VS Code does.

Both compiler packages come from npm, pinned to an exact version. They are
deliberately not on a range: the extension carries them inside the VSIX, so it
is re-released when either changes rather than resolving something new at
install time.

## Licence

This extension is MIT, see [LICENSE](LICENSE). The compiler, its libraries and
CODAL carry their own licences, and every notice ships inside the extension:
see [LICENSES.md](LICENSES.md).
