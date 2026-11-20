.section .rodata.fixture,"a",@progbits
.balign 4
.global raster_fixture_begin, raster_fixture_end
raster_fixture_begin:
    .incbin "fixtures.bin"
raster_fixture_end:
