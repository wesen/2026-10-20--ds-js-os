// The simulated PicoCalc board: the ST7365P panel on SPI2 and the STM32 keyboard/power controller on I2C0.
#include <stdlib.h>
#include "../nucleus/nucleus.h"
void sim_init(void) { srand(1); st7365p_reset(); stm32_init(); }
