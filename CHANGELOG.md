# Release Notes

## v0.4.0 - Unreleased

- Build errors and warnings in your own files appear in the Problems panel at
  their line and column.
  An error CODAL's headers report because of your code is shown at your line
  that caused it, and a link error at the line that calls it.
- The output channel leaves out the warnings CODAL's own headers raise, about
  45 per file, and says how many it left out.
- Every `.cpp` file is compiled before a build stops, so two broken files
  show both files' errors.

## v0.3.1 - 2026/09/30

- Update button text
- Fix project description images not loading on vscode.dev.
- Added to the sidebar panel a "Show all actions" link under the buttons.
  It opens the micro:bit manager's menu that can also be triggered from the
  status bar.
- `Create C++ Project` now writes a `codal.json` and a `source/main.cpp`, the
  layout of CODAL's own samples. A project that already has a `main.cpp`, in
  `source/` or beside `codal.json`, is left as it is.

## v0.3.0 - 2026/09/19

- Sidebar panel is no longer shared with other micro:bit extensions.
  It is now a dedicated panel for this one.
- Its commands are still in the micro:bit menu in the status bar.

## v0.2.0 - 2026/09/17

- Added extension icon
- This extension uses
  [BBC micro:bit Manager](https://github.com/carlosperate/vscode-microbit-manager),
  which is installed with it and owns the connection to the board,
  the serial terminal and the shared panel. Same as MicroPython extension.
- Added a C++ section to the shared BBC micro:bit side panel, with
  buttons to build the project, flash it, and open the serial terminal.
- Added combined `npm run test:all` command to run all tests.

## v0.1.0 - 2026/09/13

Preview release.

- Compiles the C++ files in a workspace folder with a prebuilt CODAL v0.3.5.
- The compiler is Arm Toolchain for Embedded 21.1.1's Clang as WebAssembly.
- Included command to create a project.
