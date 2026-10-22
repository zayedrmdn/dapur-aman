"""Vision Agent for Dapur Aman.

Inspects food tray photos, verifies menu components, detects safety and quality
issues with localized bounding boxes, and formats responses matching UI-1 and UI-2.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.schemas.vision import (
    EvidenceBoxSchema,
    FindingCardSchema,
    FoodComponentSchema,
    InspectionResponseSchema,
)
from agents.vision.prompts import VISION_SYSTEM_INSTRUCTION

logger = logging.getLogger("dapur_aman.vision")

load_dotenv()


def sanitize_box(box_data: dict[str, Any] | None) -> EvidenceBoxSchema | None:
    """Safeguard to ensure coordinates satisfy EvidenceBox constraints (0 <= c <= 1, min < max)."""
    if not box_data:
        return None

    try:
        x_min = float(box_data.get("x_min", 0.0))
        y_min = float(box_data.get("y_min", 0.0))
        x_max = float(box_data.get("x_max", 1.0))
        y_max = float(box_data.get("y_max", 1.0))

        # Normalize if model outputs coordinates in 0..1000 scale
        if x_max > 1.0 or y_max > 1.0 or x_min > 1.0 or y_min > 1.0:
            x_min /= 1000.0
            y_min /= 1000.0
            x_max /= 1000.0
            y_max /= 1000.0

        x_min = max(0.0, min(1.0, x_min))
        y_min = max(0.0, min(1.0, y_min))
        x_max = max(0.0, min(1.0, x_max))
        y_max = max(0.0, min(1.0, y_max))

        # If inverted, swap
        if x_min > x_max:
            x_min, x_max = x_max, x_min
        if y_min > y_max:
            y_min, y_max = y_max, y_min

        # If collapsed into a single point/line, expand slightly
        if x_max - x_min < 0.005:
            if x_max + 0.02 <= 1.0:
                x_max += 0.02
            else:
                x_min = max(0.0, x_min - 0.02)

        if y_max - y_min < 0.005:
            if y_max + 0.02 <= 1.0:
                y_max += 0.02
            else:
                y_min = max(0.0, y_min - 0.02)

        return EvidenceBoxSchema(
            x_min=round(x_min, 4),
            y_min=round(y_min, 4),
            x_max=round(x_max, 4),
            y_max=round(y_max, 4),
        )
    except Exception as e:
        logger.warning("Failed to sanitize bounding box: %s, dropping box", e)
        return None


class VisionAgent:
    """Food inspection vision agent using Google Gemini Multimodal on Vertex AI."""

    def __init__(
        self,
        model: str | None = None,
        project: str | None = None,
        location: str | None = None,
    ):
        self.model = model or os.getenv("AI_MODEL", "gemini-3.8-flash")
        self.project = project or os.getenv("GOOGLE_CLOUD_PROJECT", "hackathon-primestep-08")
        self.location = location or os.getenv("GOOGLE_CLOUD_LOCATION", "global")

        # Initialize Google GenAI client pointing to Vertex AI
        self.client = genai.Client(
            vertexai=True,
            project=self.project,
            location=self.location,
        )

    def _build_contents(
        self,
        photo_bytes: bytes,
        table_name: str,
        menu_items: list[str] | None = None,
        content_type: str = "image/jpeg",
    ) -> list[Any]:
        contents: list[Any] = []

        image_part = types.Part.from_bytes(
            data=photo_bytes,
            mime_type=content_type,
        )
        contents.append("PHOTO UNDER INSPECTION:")
        contents.append(image_part)

        items_str = ", ".join(menu_items) if menu_items else "Nasi putih, Ayam kecap, Tumis buncis, Tahu goreng, Anggur"

        prompt = f"""
INSPECTION REQUEST:
- Table / Location: '{table_name}'
- Today's Expected Menu Items: [{items_str}]

Please inspect the tray photo and output JSON matching the InspectionResponseSchema:
1. `table_name`: '{table_name}'
2. `timestamp_str`: Current inspection time (e.g. '08:11')
3. `headline`: Bold banner title:
   - If clean: 'No visible concerns, packing goes on'
   - If safety issues: 'X safety spots to fix before packing on'
   - If quality issues: 'X quality spots to fix before packing on'
   - If image blurry or tray cropped: 'Tray cut off at the edge. Please retake'
4. `summary_label`: Concise badge text for UI-1 list:
   - 'No spots' (if clean)
   - 'X safety spots' (e.g. '2 safety spots')
   - 'X quality spots' (e.g. '1 quality spot')
   - 'Tray cut off at the edge'
5. `status`: 'clean', 'review_required', or 'retake_required'
6. `primary_action_label`: 'Photo of the next table' (if clean) or 'Fix these, then retake' (if issues)
7. `detected_components`: For each item in today's menu, verify presence, status ('present', 'missing', 'substituted'), note, and bounding box.
8. `findings`: Card items displayed below the photo in UI-2:
   - `id`: 'F-01', 'F-02', etc.
   - `title`: Short bold title (e.g. 'Chicken may be undercooked', 'Something beside the tofu', 'Greens are sawi, menu says buncis')
   - `level`: 'safety' or 'quality'
   - `detail`: Concise bullet explanation (e.g. 'Pink near the bone • Salmonella risk', 'Possible foreign object', 'Menu part is wrong')
   - `box`: Normalized bounding box around the issue
   - `icon_type`: 'safety' or 'quality'
"""
        contents.append(prompt)
        return contents

    def inspect_sync(
        self,
        photo_bytes: bytes,
        table_name: str = "Table 1",
        menu_items: list[str] | None = None,
        content_type: str = "image/jpeg",
    ) -> InspectionResponseSchema:
        """Synchronous inspection call."""
        contents = self._build_contents(
            photo_bytes=photo_bytes,
            table_name=table_name,
            menu_items=menu_items,
            content_type=content_type,
        )

        config = types.GenerateContentConfig(
            system_instruction=VISION_SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=InspectionResponseSchema,
            temperature=0.1,
        )

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )

            raw_text = response.text or "{}"
            data = json.loads(raw_text)

            # Sanitize findings bounding boxes
            cleaned_findings: list[FindingCardSchema] = []
            for f in data.get("findings", []):
                cleaned_box = sanitize_box(f.get("box"))
                cleaned_findings.append(
                    FindingCardSchema(
                        id=f.get("id", "F-01"),
                        title=f.get("title", ""),
                        level=f.get("level", "safety"),
                        detail=f.get("detail", ""),
                        box=cleaned_box,
                        icon_type=f.get("icon_type", f.get("level", "safety")),
                    )
                )

            # Sanitize detected components
            cleaned_components: list[FoodComponentSchema] = []
            for comp in data.get("detected_components", []):
                comp_box = sanitize_box(comp.get("box"))
                cleaned_components.append(
                    FoodComponentSchema(
                        name=comp.get("name", ""),
                        status=comp.get("status", "present"),
                        box=comp_box,
                        note=comp.get("note"),
                    )
                )

            current_time = datetime.now(timezone.utc).strftime("%H:%M")

            return InspectionResponseSchema(
                table_name=data.get("table_name", table_name),
                timestamp_str=data.get("timestamp_str") or current_time,
                headline=data.get("headline", "Inspection completed"),
                summary_label=data.get("summary_label", "No spots"),
                status=data.get("status", "clean"),
                primary_action_label=data.get("primary_action_label", "Photo of the next table"),
                detected_components=cleaned_components,
                findings=cleaned_findings,
                image_quality_issues=data.get("image_quality_issues", []),
                missing_evidence=data.get("missing_evidence", []),
            )

        except Exception as e:
            logger.error("Vision inspection error: %s", e)
            raise e

    async def inspect(
        self,
        photo_bytes: bytes,
        table_name: str = "Table 1",
        menu_items: list[str] | None = None,
        content_type: str = "image/jpeg",
    ) -> InspectionResponseSchema:
        """Asynchronous inspection running in worker thread."""
        return await asyncio.to_thread(
            self.inspect_sync,
            photo_bytes=photo_bytes,
            table_name=table_name,
            menu_items=menu_items,
            content_type=content_type,
        )


# Singleton helper
_default_vision_agent: VisionAgent | None = None


def get_vision_agent() -> VisionAgent:
    global _default_vision_agent
    if _default_vision_agent is None:
        _default_vision_agent = VisionAgent()
    return _default_vision_agent


async def inspect_photo(
    photo_bytes: bytes | None = None,
    table_name: str = "Table 1",
    menu_items: list[str] | None = None,
    content_type: str = "image/jpeg",
    photo: Any = None,
    menu: Any = None,
) -> InspectionResponseSchema:
    if photo is not None:
        photo_bytes = getattr(photo, "content", photo_bytes)
        content_type = getattr(photo, "media_type", content_type)
    if menu is not None:
        menu_items = getattr(menu, "items", None) or [getattr(menu, "name", "MBG menu")]

    if not photo_bytes:
        raise ValueError("photo_bytes or photo object is required")

    agent = get_vision_agent()
    return await agent.inspect(
        photo_bytes=photo_bytes,
        table_name=table_name,
        menu_items=menu_items,
        content_type=content_type,
    )
