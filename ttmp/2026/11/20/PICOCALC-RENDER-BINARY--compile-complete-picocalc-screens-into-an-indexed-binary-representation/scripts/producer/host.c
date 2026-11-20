#include <stdint.h>
#include <time.h>
static uint64_t host_us(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (uint64_t)t.tv_sec*1000000+t.tv_nsec/1000;}
#define BX_NOW() host_us()
#include "../native/02-native.inc"
#include "binary_producer.inc"
int main(int argc,char **argv){if(argc!=3)return 1;return bp_run(argv[1],atoi(argv[2]));}
