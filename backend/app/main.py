"""Dapur Aman - Vision Agent API.

Focused API endpoint for food safety and quality inspection with bounding boxes,
matching UI-1 (Overview Screen) and UI-2 (Detail Inspection Screen).
"""

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.schemas.vision import InspectionResponseSchema
from agents.vision.agent import get_vision_agent

app = FastAPI(
    title="Dapur Aman - Vision Agent API",
    description="API Inspeksi Visual Makanan Makan Bergizi Gratis (MBG) berbasis Gemini 3.8 Flash & Google Vertex AI.",
    version="1.0.0",
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["System"])
def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "service": "dapur-aman-vision-api"}


@app.post(
    "/api/vision/inspect",
    response_model=InspectionResponseSchema,
    tags=["Vision Agent"],
    summary="Inspeksi foto makanan per meja (Table) dan hasilkan data sesuai UI",
)
async def inspect_food_photo(
    photo: UploadFile = File(..., description="Foto baki makanan yang akan diinspeksi (JPEG atau PNG)"),
    table_name: str = Form("Table 1", description="Nama meja / lokasi baki (contoh: Table 1, Table 2, Rack A)"),
    menu_items: str = Form(
        "Nasi putih, Ayam kecap, Tumis buncis, Tahu goreng, Anggur",
        description="Daftar komponen menu hari ini, pisahkan dengan tanda koma",
    ),
) -> InspectionResponseSchema:
    """Endpoint utama inspeksi foto baki makanan:

    - **Input**:
      * `photo`: File foto baki makanan
      * `table_name`: Nama meja/rak (misal: 'Table 1', 'Table 2', 'Rack A')
      * `menu_items`: Menu hari ini (misal: 'Nasi putih, Ayam kecap, Tumis buncis, Tahu goreng, Anggur')

    - **Output (Langsung mencakup kebutuhan UI-1 dan UI-2)**:
      * `headline`: Banner judul (misal: '2 safety spots to fix before packing on')
      * `summary_label`: Ringkasan untuk baris list meja (misal: '2 safety spots' atau 'No spots')
      * `status`: 'clean' | 'review_required' | 'retake_required'
      * `primary_action_label`: Tombol aksi (misal: 'Fix these, then retake')
      * `detected_components`: Komponen makanan di foto dengan status ('present', 'missing', 'substituted') dan bounding box
      * `findings`: Kartu detail temuan di bawah foto (title, level 'safety'/'quality', detail, bounding box)
    """
    # 1. Validasi foto
    photo_bytes = await photo.read()
    if not photo_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File foto tidak boleh kosong",
        )

    if len(photo_bytes) > 4 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ukuran foto melebihi batas maksimal 4 MB",
        )

    content_type = photo.content_type or "image/jpeg"

    # 2. Parse daftar item menu
    items_list = [item.strip() for item in menu_items.split(",") if item.strip()]

    # 3. Jalankan analisis Vision Agent
    try:
        agent = get_vision_agent()
        result = await agent.inspect(
            photo_bytes=photo_bytes,
            table_name=table_name,
            menu_items=items_list,
            content_type=content_type,
        )
        return result

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vision Agent gagal menganalisis foto: {e}",
        )
