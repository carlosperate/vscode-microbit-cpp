/** The program a new project starts from. `test/workspace/main.cpp` is a copy, and a test keeps them equal. */
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
