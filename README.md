# BBC micro:bit C++ VS Code Extension

Build C++ programs for the BBC micro:bit with
[CODAL](https://github.com/lancaster-university/codal-microbit-v2), in VS Code
(web and desktop) without any additional compilers or toolchains.

The Clang compiler, LLD and the LLVM binutils have been built to WebAssembly,
and together with Arm Toolchain for Embedded's C and C++ libraries
and a prebuilt CODAL, this extension includes everything internally to compile
micro:bit C++ programmes.

🚧 **Preview.** It builds one CODAL version, v0.3.5.
See [the limits](#limits-of-this-preview).

## How To Use This Extension

1. Open a workspace that holds a `main.cpp`
    1. Alternatively you can run the `BBC micro:bit C++: Create C++ Project`
      command, which writes a `codal.json` and a `source/main.cpp`, the
      layout of CODAL's own samples.
2. Open the **BBC micro:bit C++** icon in the Activity Bar, and press
   **Build micro:bit C++ project**.
3. `MICROBIT.hex` and `MICROBIT.map` appear beside your sources.
   The compiler's output is in the **BBC micro:bit C++** output channel, with
   errors, warnings and notes in your theme's colours, and the errors and
   warnings in your own files also appear in the **Problems** panel.
4. Press **Flash C++ project hex** to build again and write it to a connected
   micro:bit V2, or copy `MICROBIT.hex` onto the `MICROBIT` drive yourself.
5. **Open serial terminal** shows what the program prints.

Every button is also a command, so `BBC micro:bit C++: Build C++ Project` and
`BBC micro:bit C++: Flash C++ Project` do the same from the Command Palette, which
opens with `Ctrl/Cmd`+`Shift`+`P` or `F1`.

## The board

Connecting, flashing and the serial terminal are managed by the
[BBC micro:bit Manager](https://github.com/carlosperate/vscode-microbit-manager)
extension, which is installed together with this one. It creates a `micro:bit`
item in the status bar, which lists this extension's commands too.

A build takes every `.cpp`, `.cc` and `.cxx` file under the workspace, and
every header, excluding what's listed in the `bbcmicrobit-cpp.build.exclude`
setting.

## CODAL's settings: `codal.json`

The `config` settings in the `codal.json` at the top of your workspace work as
they do with CODAL's own build, for example to turn on Bluetooth:

```json
{
    "config": {
        "MICROBIT_BLE_ENABLED": 1
    }
}
```

CODAL comes already compiled with the settings a new project gets (the
SoftDevice present, the Bluetooth stack off), so those build straight away.
Other settings mean compiling CODAL itself again: the first build with them
takes about 15 to 30 seconds more, with its progress in the build notification.
The result is kept for further builds, so the next ones with the same settings
are quick again.

A `codal.json` this extension cannot follow stops the build before anything is
compiled, with a message saying what to change: one that is not valid JSON, a
`target` naming another CODAL than v0.3.5 (leave `target` out, or name exactly
the one a new project gets), `application` or `output_folder`, and
`SOFTDEVICE_PRESENT` without `DEVICE_BLE` set to 1. A setting CODAL cannot
compile with fails the build with CODAL's own error in the output channel.

## The C++ toolchain built into this extension

On a desktop computer, you normally have to install `arm-none-eabi-gcc`, CMake,
Ninja, and Python; then clone `microbit-v2-samples`, and use the build script.

This extension carries the compiler in
[`microbit-clang-wasm`](https://github.com/carlosperate/microbit-clang-wasm)
and CODAL with its build recipe in
[`microbit-clang-wasm-codal`](https://github.com/carlosperate/microbit-clang-wasm-codal),
currently using CODAL v0.3.5.
The recipe is captured from CODAL's own CMake build with the Clang toolchain,
so the flags are the ones that build uses, and CODAL compiled here with your
settings matches what CODAL's own build makes of them.

## Limits of this preview

- **One CODAL version**, v0.3.5. Your `codal.json` settings work, but its
  `target` cannot choose another CODAL.
- **CODAL compiled for your settings is not saved**: closing VS Code, or
  reloading the page on the web, means the next build compiles it again.
- **micro:bit V2 only.** CODAL builds for the V2's processor, so flashing
  refuses a V1 rather than writing an image it cannot run.
- **Errors show after a build**, not as you type.
- **CODAL's warnings are only in the output channel.** Its headers raise about
  45 warnings while compiling each of your files; the output channel shows
  them with everything else the compiler printed and each file's full command,
  but the Problems panel marks only your own files. When CODAL itself is
  compiled for your settings, its files are listed one line each, without
  their warnings.
- **Memory.** The compiler needs a bit less than 1 GB of RAM when it compiles,
  and keeps about half of that warm, so that later builds start and complete
  faster.
  On web close/reload the window to free up the memory back, and on desktop
   you can close/reopen the window.

## Licence

This extension is MIT, see [LICENSE](LICENSE). The compiler, its libraries and
CODAL carry their own licences, and every notice ships inside the extension:
see [LICENSES.md](LICENSES.md).
