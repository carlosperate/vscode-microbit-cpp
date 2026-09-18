# Release Notes

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
