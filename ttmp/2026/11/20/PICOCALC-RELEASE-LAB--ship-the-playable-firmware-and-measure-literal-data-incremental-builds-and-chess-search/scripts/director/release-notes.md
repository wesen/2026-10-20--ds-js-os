PicoCalc ESP32-P4 ordinary native firmware with Files, Agenda, Editor, Snake and Chess, including the application-delivered native Chess painter, six solid pieces and the F3/F4 camera orbit. This is the ordinary image with the standard keyboard driver. The panel observer is only in the separate lab image.

The assets are the application image at 0x10000 and its matching partition table at 0x8000 for an already-provisioned board with the matching bootloader. The application and table were verified by flash readback. The observed variant passed the four-turn game and all 32 SPI-verified camera phases. Physical keypad input still needs confirmation with a responding controller.

The source and build procedure are in the PICOCALC-CHESS-3D ticket, scripts/camera/03-build.sh, ordinary profile. The checksums identify the physical release.
