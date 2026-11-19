#include "slots.h"

#define SLOT(name) __attribute__((export_name(#name)))
SLOT(filesName) int filesName(const files_string *value, files_string *output)
{
    __builtin_trap();
}
SLOT(filesCompare) int filesCompare(const files_string *left, bool left_dir, const files_string *right, bool right_dir)
{
    __builtin_trap();
}
SLOT(filesSelect) int filesSelect(int current, int count, int delta)
{
    __builtin_trap();
}
SLOT(filesAction) int filesAction(int key, bool once, bool prompt, int item, bool confirmed)
{
    __builtin_trap();
}
