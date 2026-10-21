"""CLI test script to verify the Vision Agent.

Usage:
    # 1. Run with built-in test image:
    uv run python test_vision.py

    # 2. Run with your own food photo:
    uv run python test_vision.py "path/to/food_photo.jpg"
"""

import asyncio
import os
import struct
import sys
import zlib

from agents.contract import Menu, Photo
from agents.vision import inspect_photo, get_vision_agent


def generate_dummy_food_tray() -> bytes:
    """Generate a simple 200x200 PNG representing a food tray with rice and a dark spot (foreign object)."""
    width, height = 200, 200
    pixels = []
    for y in range(height):
        row = bytearray(b"\x00")
        for x in range(width):
            # Simulated tray border (dark gray)
            if x < 10 or x > 190 or y < 10 or y > 190:
                row.extend(b"\x40\x40\x40")
            # Foreign dark object in rice area (x: 80-110, y: 70-75)
            elif 80 <= x <= 110 and 70 <= y <= 75:
                row.extend(b"\x05\x05\x05")  # black hair/wire
            # Rice section (top half)
            elif y < 100:
                row.extend(b"\xfa\xf8\xee")
            # Fried chicken / side dish section (bottom half)
            else:
                row.extend(b"\xb8\x65\x20")
        pixels.append(bytes(row))

    raw_data = b"".join(pixels)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw_data))
    png += chunk(b"IEND", b"")
    return png


async def main():
    agent = get_vision_agent()
    print("=" * 60)
    print(" DAPUR AMAN - VISION AGENT TEST")
    print("=" * 60)
    print(f"Model    : {agent.model}")
    print(f"Project  : {agent.project}")
    print(f"Location : {agent.location}")
    print("-" * 60)

    # Check if user provided an image file argument
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        image_path = sys.argv[1]
        print(f"Menggunakan file foto: {image_path}")
        with open(image_path, "rb") as f:
            photo_bytes = f.read()
    else:
        print("Menggunakan foto baki simulasi (nasi + benda asing)...")
        photo_bytes = generate_dummy_food_tray()

    photo = Photo(content=photo_bytes, media_type="image/jpeg")
    menu = Menu(menu_id="MBG-01", name="Nasi Putih dengan Ayam Goreng Lengkuas")

    print("\nSedang menganalisis foto dengan Gemini Vision...")
    try:
        observation = await inspect_photo(photo=photo, menu=menu)

        print("\n" + "=" * 60)
        print(" HASIL INSPEKSI VISION AGENT")
        print("=" * 60)

        if not observation.observations:
            print(" [OK] Tidak ada isu visual / anomali yang ditemukan.")
        else:
            print(f" Ditemukan {len(observation.observations)} temuan visual:")
            for idx, obs in enumerate(observation.observations, 1):
                print(f"\n  [{idx}] Jenis Isu : {obs.concern_type.upper()}")
                print(f"      Penjelasan: {obs.explanation}")
                if obs.box:
                    print(
                        f"      Bounding Box: [x_min: {obs.box.x_min}, y_min: {obs.box.y_min}, "
                        f"x_max: {obs.box.x_max}, y_max: {obs.box.y_max}]"
                    )
                else:
                    print("      Bounding Box: Tidak ada (lokasi umum / seluruh baki)")
                if obs.uncertainty:
                    print(f"      Ketidakpastian: {obs.uncertainty}")

        if observation.image_quality_issues:
            print("\n  Masalah Kualitas Foto:")
            for issue in observation.image_quality_issues:
                print(f"   - {issue}")

        if observation.missing_evidence:
            print("\n  Bukti yang Kurang / Tertutup:")
            for missing in observation.missing_evidence:
                print(f"   - {missing}")

        print("\n" + "=" * 60)
        print(" Status: Kontrak Pydantic VisionObservation VALID! ")
        print("=" * 60)

    except Exception as err:
        print(f"\n❌ Error saat inspeksi: {err}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
