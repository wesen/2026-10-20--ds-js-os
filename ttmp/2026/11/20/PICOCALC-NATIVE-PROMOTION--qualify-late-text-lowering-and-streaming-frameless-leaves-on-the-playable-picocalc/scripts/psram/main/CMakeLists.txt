idf_component_register(SRCS "bench.c" INCLUDE_DIRS "." EMBED_FILES "stock.elf" "promoted.elf" REQUIRES espressif__elf_loader esp_timer esp_hw_support)
