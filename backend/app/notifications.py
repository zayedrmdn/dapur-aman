"""Telegram notification service for Dapur Aman.

Supports:
1. Instant Safety Alerts to Kitchen Supervisors when contaminants or critical concerns are detected.
2. Batch inspection reports (Laporan Pemeriksaan Batch) to school contacts after a supervisor closes a batch.
"""

import html
import logging
from datetime import datetime, timezone, timedelta
import httpx

from app.config import (
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_SUPERVISOR_CHAT_ID,
    TELEGRAM_SCHOOL_CHAT_ID,
)

logger = logging.getLogger("dapur_aman.notifications")

# Western Indonesia Time (WIB, UTC+7)
WIB = timezone(timedelta(hours=7))


def current_wib_str() -> str:
    return datetime.now(WIB).strftime("%H:%M WIB, %d %b %Y")


async def send_telegram_raw(
    text: str,
    chat_id: str,
    photo_url: str | None = None,
) -> dict:
    """Keep Telegram delivery disabled until further notice."""
    logger.info("Telegram delivery is disabled")
    return {
        "status": "disabled",
        "message": "Pengiriman Telegram dinonaktifkan sampai pemberitahuan lebih lanjut.",
    }


async def send_supervisor_safety_alert(
    table_name: str,
    batch_id: str,
    findings: list,
    photo_url: str | None = None,
    chat_id: str | None = None,
    supervisor_name: str | None = "Supervisor Dapur MBG",
    supervisor_phone: str | None = "+62 811-2233-4455",
) -> dict:
    """Format and send safety alert to kitchen supervisor."""
    target_chat = chat_id or TELEGRAM_SUPERVISOR_CHAT_ID or TELEGRAM_SCHOOL_CHAT_ID

    findings_lines = []
    for idx, f in enumerate(findings, 1):
        # f can be ContractFinding or Finding model or dict
        concern = getattr(f, "concern_type", None) or (f.get("concern_type") if isinstance(f, dict) else "Masalah Kualitas")
        explanation = getattr(f, "explanation", None) or (f.get("explanation") if isinstance(f, dict) else "")
        level = getattr(f, "level", "safety") or (f.get("level") if isinstance(f, dict) else "safety")
        rule = getattr(f, "rule_reference", None) or (f.get("rule_reference") if isinstance(f, dict) else None)
        action = getattr(f, "suggested_action", None) or (f.get("suggested_action") if isinstance(f, dict) else "")

        badge = "🔴 [BAHAYA KEAMANAN]" if level == "safety" else "🟡 [PERHATIAN KUALITAS]"
        line = f"<b>{idx}. {badge} {html.escape(str(concern).title())}</b>\n"
        if explanation:
            line += f"   • Detail: <i>{html.escape(explanation)}</i>\n"
        if rule:
            line += f"   • Rujukan: <code>{html.escape(rule)}</code>\n"
        if action:
            line += f"   • Tindakan: {html.escape(action)}\n"
        findings_lines.append(line)

    findings_text = "\n".join(findings_lines) if findings_lines else "• Perlu peninjauan visual oleh supervisor."

    supervisor_block = ""
    if supervisor_name or supervisor_phone:
        parts = []
        if supervisor_name:
            parts.append(f"<b>{html.escape(supervisor_name)}</b>")
        if supervisor_phone:
            parts.append(f"<code>{html.escape(supervisor_phone)}</code>")
        supervisor_block = f"👤 <b>Penerima Alert:</b> {' • '.join(parts)}\n"

    message = (
        "🚨 <b>PERINGATAN KEAMANAN PANGAN — DAPUR AMAN MBG</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"{supervisor_block}"
        f"📍 <b>Lokasi / Meja:</b> {html.escape(table_name)}\n"
        f"🆔 <b>Batch ID:</b> <code>{html.escape(batch_id)}</code>\n"
        f"⏰ <b>Waktu Deteksi:</b> {current_wib_str()}\n"
        "⚠️ <b>Status Batch:</b> <b>PERLU TINDAKAN (Review Required)</b>\n\n"
        "🔍 <b>TEMUAN AGEN AI (Vision + Compliance):</b>\n"
        f"{findings_text}\n"
        "📋 <b>INSTRUKSI SUPERVISOR:</b>\n"
        "1. Segera tahan proses packing pada meja ini.\n"
        "2. Instruksikan staf untuk memperbaiki/mengganti porsi terdampak.\n"
        "3. Lakukan foto ulang (retake) untuk pemeriksaan ulang sebelum disegel.\n"
    )

    if photo_url:
        message += f"\n🔗 <a href='{html.escape(photo_url)}'>Buka Bukti Foto Hasil Inspeksi</a>\n"

    message += "\n🛡️ <i>Sistem Otomasi Pengawasan Pangan MBG — Nexara Vision</i>"

    return await send_telegram_raw(message, target_chat, photo_url=photo_url)


def holding_deadline_wib(first_photo_at: datetime | None, holding_hours: int = 4) -> str:
    start = first_photo_at or datetime.now(timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return (start.astimezone(WIB) + timedelta(hours=holding_hours)).strftime("%H:%M WIB")


async def send_school_clearance_report(
    batch_id: str,
    menu_name: str,
    supervisor_name: str = "Supervisor Dapur MBG",
    school_name: str = "SDN 01 Merdeka Bandung",
    principal_name: str | None = "Bpk. Drs. H. Bambang Sutrisno, M.Pd",
    phone_number: str | None = "+62 812-3456-7890",
    address: str | None = "Jl. Merdeka No. 45, Sumur Bandung",
    total_trays: int = 450,
    holding_hours: int = 4,
    photo_url: str | None = None,
    chat_id: str | None = None,
    first_photo_at: datetime | None = None,
) -> dict:
    """Format and send the batch inspection report to the school contact."""
    target_chat = chat_id or TELEGRAM_SCHOOL_CHAT_ID or TELEGRAM_SUPERVISOR_CHAT_ID

    limit_time = holding_deadline_wib(first_photo_at, holding_hours)

    recipient_lines = [f"🏫 <b>{html.escape(school_name)}</b>"]
    if principal_name:
        recipient_lines.append(f"👤 <b>Kepala Sekolah:</b> {html.escape(principal_name)}")
    if phone_number:
        recipient_lines.append(f"📞 <b>Kontak Penerima:</b> <code>{html.escape(phone_number)}</code>")
    if address:
        recipient_lines.append(f"📍 <b>Alamat Kirim:</b> <i>{html.escape(address)}</i>")
    recipient_block = "\n".join(recipient_lines)

    message = (
        "📋 <b>Laporan Pemeriksaan Batch</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "Kepada Yth:\n"
        "<b>Tim Pengawas & Satgas MBG Sekolah</b>\n"
        f"{recipient_block}\n\n"
        f"📦 <b>ID Batch:</b> <code>{html.escape(batch_id)}</code>\n"
        f"🍽️ <b>Menu Hari Ini:</b> {html.escape(menu_name)}\n"
        f"🍱 <b>Alokasi Porsi:</b> {total_trays} Baki Siswa\n"
        f"🕒 <b>Waktu Laporan:</b> {current_wib_str()}\n"
        f"🚚 <b>Status Pengiriman:</b> Batch ditutup oleh supervisor <b>{html.escape(supervisor_name)}</b> setelah pemeriksaan manusia.\n\n"
        "🛡️ <b>CATATAN PEMERIKSAAN DAPUR AMAN:</b>\n"
        "• Vision Agent tidak melihat masalah yang tersisa pada foto terakhir.\n"
        "• Semua temuan sudah ditangani dan dicatat oleh manusia.\n"
        "• Foto hanya membantu melihat kemungkinan masalah. Hasil foto bukan jaminan keamanan pangan.\n\n"
        f"⏱️ <b>BATAS WAKTU SIMPAN (HOLDING TIME):</b>\n"
        f"Maksimal pukul <b>{limit_time}</b> (asumsi demo: 4 jam sejak foto pertama batch, belum diverifikasi; waktu sejak selesai masak bisa lebih lama).\n"
    )

    if photo_url:
        message += f"\n📸 <a href='{html.escape(photo_url)}'>Lihat Arsip Foto Baki Terakhir</a>\n"

    message += (
        "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "<i>Pesan demo Dapur Aman, dikirim atas keputusan supervisor. Data sekolah adalah data sintetis.</i>"
    )

    return await send_telegram_raw(message, target_chat, photo_url=photo_url)


async def send_supervisor_retake_notification(
    table_name: str,
    batch_id: str,
    findings: list,
    photo_url: str | None = None,
    chat_id: str | None = None,
    supervisor_name: str | None = "Supervisor Dapur MBG",
    supervisor_phone: str | None = "+62 811-2233-4455",
) -> dict:
    """Format and send retake verification result to kitchen supervisor."""
    target_chat = chat_id or TELEGRAM_SUPERVISOR_CHAT_ID or TELEGRAM_SCHOOL_CHAT_ID

    supervisor_block = ""
    if supervisor_name or supervisor_phone:
        parts = []
        if supervisor_name:
            parts.append(f"<b>{html.escape(supervisor_name)}</b>")
        if supervisor_phone:
            parts.append(f"<code>{html.escape(supervisor_phone)}</code>")
        supervisor_block = f"👤 <b>Penerima Laporan:</b> {' • '.join(parts)}\n"

    is_clean = len(findings) == 0

    if is_clean:
        status_line = "✅ <b>STATUS: TIDAK ADA MASALAH TERLIHAT PADA FOTO ULANG</b>"
        detail_line = (
            "Baki hasil periksa ulang (retake) telah diperiksa oleh Vision Agent.\n"
            "• Foto hanya membantu melihat kemungkinan masalah. Hasil foto bukan jaminan keamanan pangan."
        )
        action_line = (
            "👉 <b>Tindakan:</b> Periksa baki secara langsung. Temuan terbuka tetap harus ditandai selesai oleh manusia."
        )
    else:
        status_line = "⚠️ <b>STATUS: MASIH DITEMUKAN MASALAH</b>"
        findings_lines = []
        for idx, f in enumerate(findings, 1):
            concern = getattr(f, "concern_type", None) or (f.get("concern_type") if isinstance(f, dict) else "Masalah Kualitas")
            explanation = getattr(f, "explanation", None) or (f.get("explanation") if isinstance(f, dict) else "")
            findings_lines.append(f"• <b>{html.escape(str(concern))}</b>: <i>{html.escape(explanation)}</i>")
        detail_line = "\n".join(findings_lines)
        action_line = "👉 <b>Tindakan:</b> Minta staf memperbaiki kembali porsi yang belum sesuai standar."

    message = (
        "🔄 <b>HASIL VERIFIKASI FOTO ULANG (RETAKE) — DAPUR AMAN</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"{supervisor_block}"
        f"📍 <b>Lokasi / Meja:</b> {html.escape(table_name)}\n"
        f"🆔 <b>Batch ID:</b> <code>{html.escape(batch_id)}</code>\n"
        f"⏰ <b>Waktu Periksa Ulang:</b> {current_wib_str()}\n"
        f"{status_line}\n\n"
        "🔍 <b>HASIL PEMERIKSAAN AI:</b>\n"
        f"{detail_line}\n\n"
        f"{action_line}\n"
    )

    if photo_url:
        message += f"\n📸 <a href='{html.escape(photo_url)}'>Buka Arsip Foto Periksa Ulang</a>\n"

    message += "\n🛡️ <i>Sistem Otomasi Pengawasan Pangan MBG — Nexara Vision</i>"

    return await send_telegram_raw(message, target_chat, photo_url=photo_url)
