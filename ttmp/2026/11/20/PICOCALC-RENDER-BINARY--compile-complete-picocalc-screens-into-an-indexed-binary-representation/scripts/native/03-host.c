#include <time.h>
#include <stdint.h>
static uint64_t bx_host_us(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return (uint64_t)t.tv_sec*1000000+t.tv_nsec/1000;}
#define BX_NOW() bx_host_us()
#include "02-native.inc"
int main(int argc,char **argv){if(argc!=3)return 1;bx_trial(argv[1],atoi(argv[2]));return 0;}
