# BBC micro:bit C++ VS Code Extension

Build C++ programs for the BBC micro:bit with
[CODAL](https://github.com/lancaster-university/codal-microbit-v2), in VS Code
(web and desktop) without additional compilers or toolchains.

The Clang compiler, LLD and the LLVM binutils have been built to WebAssembly,
and together with Arm Toolchain for Embedded's C and C++ libraries
and a prebuilt CODAL, this extension includes everything internally to compile
micro:bit C++ programmes.

🚧 **Preview.** It builds one fixed CODAL version in one fixed configuration and
does not flash the board yet. See [the limits](#limits-of-this-preview).

## How To Use This Extension

1. Open a workspace that holds a `main.cpp`
    1. Alternatively you can run the `BBC micro:bit C++: Create Project`
      command to create it.
2. Run **BBC micro:bit C++: Build** from the Command Palette.
3. `MICROBIT.hex` and `MICROBIT.map` appear beside your sources, and the
   compiler's output is in the **BBC micro:bit C++** output channel.
4. Copy `MICROBIT.hex` onto the `MICROBIT` drive to run it.

To run commands from the Command Palette, press `Ctrl/Cmd`+`Shift`+`P` or `F1`.

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
- **No flashing.** The hex needs to be manually flashed to the device.
  Additional flashing capabilities will be added in a later release.
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
