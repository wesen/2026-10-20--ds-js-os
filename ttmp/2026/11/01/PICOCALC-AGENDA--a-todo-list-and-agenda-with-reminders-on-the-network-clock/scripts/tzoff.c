#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static int via_mktime(time_t ti) {   /* the ESP_PLATFORM branch in quickjs.c */
  struct tm *tm = gmtime(&ti); time_t g = mktime(tm);
  tm = localtime(&ti); time_t l = mktime(tm);
  return (int)(g - l) / 60;
}
static int via_fields(time_t ti) {   /* local minus UTC from the broken-down fields */
  struct tm g, l; gmtime_r(&ti, &g); localtime_r(&ti, &l);
  int days = l.tm_yday - g.tm_yday;
  if (l.tm_year != g.tm_year) days = l.tm_year > g.tm_year ? 1 : -1;
  return -((days * 24 + l.tm_hour - g.tm_hour) * 60 + l.tm_min - g.tm_min);
}
int main(void) {
  setenv("TZ", "EST5EDT,M3.2.0,M11.1.0", 1); tzset();
  time_t t[] = { 1782907200 /* 2026-07-01 12:00Z, EDT */, 1798545600 /* 2026-12-30 12:00Z, EST */,
                 1793512800 /* 2026-11-01 05:00Z = 01:00 EDT */, 1793520000 /* 2026-11-01 07:00Z = 02:00 EST */,
                 1798761600 /* 2027-01-01 00:00Z = 2026-12-31 19:00 EST */ };
  for (int i = 0; i < 5; i++) { struct tm l; localtime_r(&t[i], &l);
    printf("%ld  local %04d-%02d-%02d %02d:%02d isdst=%d  mktime way %4d  fields way %4d\n", (long)t[i], l.tm_year + 1900, l.tm_mon + 1, l.tm_mday, l.tm_hour, l.tm_min, l.tm_isdst, via_mktime(t[i]), via_fields(t[i])); }
}
