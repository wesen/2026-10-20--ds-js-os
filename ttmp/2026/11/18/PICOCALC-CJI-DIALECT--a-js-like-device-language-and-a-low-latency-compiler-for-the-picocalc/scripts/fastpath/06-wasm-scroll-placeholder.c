#include <stdint.h>

/* The checker replaces this body after linking. The boundary call will fail
 * every positive case if this body is ever used in the real kernel test.
 */
__attribute__((export_name("scrollStart")))
int32_t scrollStart(int32_t sel, int32_t count, int32_t visible)
{
    (void)sel;
    (void)count;
    (void)visible;
    return -999;
}
