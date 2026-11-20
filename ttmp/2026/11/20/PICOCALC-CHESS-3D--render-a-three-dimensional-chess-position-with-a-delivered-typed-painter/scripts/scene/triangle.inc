// At a pixel center y + 1/2, find the first column whose center is on
// or right of the intersection. Inputs have passed body bounds validation.
static int triangle_edge_x(int ax, int ay, int bx, int by, int y) {
  int dy = by - ay;
  int denominator = 2 * dy;
  int numerator = 2 * ax * dy + (2 * y + 1 - 2 * ay) * (bx - ax) - dy;
  return (numerator + denominator - 1) / denominator;
}

static void painter_triangle(dmabuf_t *buffer, const uint16_t *p) {
  int low = p[1], high = p[1];
  for (int i = 1; i < 3; ++i) {
    int y = p[2 * i + 1];
    if (y < low) low = y;
    if (y > high) high = y;
  }
  for (int y = low; y < high; ++y) {
    int x[2], found = 0;
    for (int i = 0; i < 3; ++i) {
      int j = (i + 1) % 3;
      int a = p[2 * i + 1] < p[2 * j + 1] ? i : j;
      int b = i + j - a;
      if (p[2 * a + 1] <= y && y < p[2 * b + 1])
        x[found++] = triangle_edge_x(p[2 * a], p[2 * a + 1], p[2 * b], p[2 * b + 1], y);
    }
    if (found == 2 && x[0] != x[1]) {
      int left = x[0] < x[1] ? x[0] : x[1];
      int right = x[0] + x[1] - left;
      gfx_fill(buffer, left, PAINTER_TOP + y, right - left, 1, p[6]);
    }
  }
}
