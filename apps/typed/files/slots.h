#pragma once
#include <stdbool.h>
#include <stdint.h>

typedef struct { uint32_t length; uint16_t units[96]; } files_string;
int filesName(const files_string *value, files_string *output);
int filesCompare(const files_string *left, bool left_dir, const files_string *right, bool right_dir);
int filesSelect(int current, int count, int delta);
int filesAction(int key, bool once, bool prompt, int item, bool confirmed);
