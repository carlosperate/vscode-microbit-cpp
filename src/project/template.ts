/**
 * What Create Project writes, as paths below its folder: the layout of CODAL's
 * own samples. `test/workspace` is a copy, and a test keeps the two equal.
 */
export const FILES = { main: 'source/main.cpp', codalJson: 'codal.json' } as const;

/** The program a new project starts from. */
export const TEMPLATE = `#include "MicroBit.h"

MicroBit uBit;

int main() {
    uBit.init();
    while (true) {
        uBit.display.scroll("HELLO WORLD");
        uBit.sleep(1000);
    }
}
`;

/** The configuration the prebuilt CODAL was made with. Nothing reads the file yet, so it can only say so. */
export const CODAL_JSON = `{
    "target": {
        "name": "codal-microbit-v2",
        "url": "https://github.com/lancaster-university/codal-microbit-v2",
        "branch": "v0.3.5",
        "type": "git"
    },
    "config": {
        "MICROBIT_BLE_ENABLED": 0,
        "MICROBIT_BLE_PAIRING_MODE": 0
    }
}
`;
