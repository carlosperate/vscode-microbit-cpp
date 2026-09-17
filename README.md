# BBC micro:bit C++ VS Code Extension

Build C++ programs for the BBC micro:bit with
[CODAL](https://github.com/lancaster-university/codal-microbit-v2), in VS Code
(web and desktop) without additional compilers or toolchains.

The Clang compiler, LLD and the LLVM binutils have been built to WebAssembly,
and together with Arm Toolchain for Embedded's C and C++ libraries
and a prebuilt CODAL, this extension includes everything internally to compile
micro:bit C++ programmes.

🚧 **Preview.** It builds one fixed CODAL version in one fixed configuration.
See [the limits](#limits-of-this-preview).

## How To Use This Extension

1. Open a workspace that holds a `main.cpp`
    1. Alternatively you can run the `BBC micro:bit C++: Create Project`
      command to create it.
2. Open the **BBC micro:bit** icon in the Activity Bar, and press
   **Build micro:bit C++ project**.
3. `MICROBIT.hex` and `MICROBIT.map` appear beside your sources, and the
   compiler's output is in the **BBC micro:bit C++** output channel.
4. Press **Flash C++ project hex** to build again and write it to a connected
   micro:bit V2, or copy `MICROBIT.hex` onto the `MICROBIT` drive yourself.
5. **Open serial terminal** shows what the program prints.

Every button is also a command, so `BBC micro:bit C++: Build` and
`BBC micro:bit C++: Flash Project` do the same from the Command Palette, which
opens with `Ctrl/Cmd`+`Shift`+`P` or `F1`.

## The board, and the panel it shares

Connecting, flashing and the serial terminal belong to the
[BBC micro:bit Manager](https://github.com/carlosperate/vscode-microbit-manager)
extension, which is installed together with this one. It owns the **BBC
micro:bit** panel, and every micro:bit language extension you have installed
adds its own section to it: with more than one, a switcher at the top of the
panel moves between them.

A build takes every `.cpp`, `.cc` and `.cxx` file under the workspace, and
every header, excluding what's listed in the `bbcmicrobit-cpp.build.exclude`
setting.

## The desktop toolchain, without the toolchain

On a desktop computer, you normally have to install `arm-none-eabi-gcc`, CMake,
Ninja, and Python; then clone `microbit-v2-samples`, and use the build script.

This extension carries the compiler in
[`microbit-clang-wasm`](https://github.com/carlosperate/microbit-clang-wasm)
and CODAL with its build recipe in
[`microbit-clang-wasm-codal`](https://github.com/carlosperate/microbit-clang-wasm-codal), currently using CODAL v0.3.5.
The recipe is captured from CODAL's own CMake build with the Clang toolchain,
so the flags and codal.json are the default ones that build uses.

## Limits of this preview

- **One CODAL version and one configuration.** `codal.json` cannot be changed
  yet; the configuration is the `microbit-v2-samples` default, with the
  SoftDevice present and the BLE stack off.
- **micro:bit V2 only.** CODAL builds for the V2's processor, so flashing
  refuses a V1 rather than writing an image it cannot run.
- **Errors are text in the output channel**, not markers in the editor.
- **Memory.** The compiler needs a bit less than 1 GB of RAM when it compiles,
  and keeps about half of that warm, so that later builds start and complete
  faster.
  On web close/reload the window to free up the memory back, and on desktop
   you can close/reopen the window.

## Licence

This extension is MIT, see [LICENSE](LICENSE). The compiler, its libraries and
CODAL carry their own licences, and every notice ships inside the extension:
see [LICENSES.md](LICENSES.md).
