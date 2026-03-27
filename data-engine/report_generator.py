#!/usr/bin/env python3
"""
report_generator.py - Generates a PDF summary report for the RE Opportunity Engine.

Produces:
  - A multi-page PDF with KPIs, model metrics, top-20 candidates table,
    property location map, and opportunity distribution chart.
  - A companion interactive HTML map (folium) saved alongside the PDF.

Usage:
  python report_generator.py --job-id <id> --output /tmp/report_<id>.pdf \
      [--filters '{"city":"tampa","min_roi":"50000","listing_type":"for_sale"}']
"""

import argparse
import io
import json
import logging
import os
import sys
from datetime import datetime, timezone

import matplotlib
matplotlib.use("Agg")
import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
import numpy as np
import psycopg2
import psycopg2.extras

import folium

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

# ── Colour palette (matches CSS variables) ───────────────────────────────────
C_ACCENT  = colors.Color(0.24, 0.49, 0.92)   # --plt-accent  (blue)
C_GREEN   = colors.Color(0.16, 0.74, 0.53)   # --plt-success
C_YELLOW  = colors.Color(0.95, 0.62, 0.18)   # --plt-warning
C_RED     = colors.Color(0.94, 0.27, 0.27)   # --plt-danger
C_DARK    = colors.Color(0.08, 0.11, 0.20)   # --plt-primary
C_MUTED   = colors.Color(0.45, 0.50, 0.60)   # --plt-muted
C_BG      = colors.Color(0.97, 0.97, 0.98)   # --plt-bg
C_BORDER  = colors.Color(0.88, 0.90, 0.94)   # --plt-border
C_WHITE   = colors.white

# Matplotlib equivalents
M_ACCENT  = (0.24, 0.49, 0.92)
M_GREEN   = (0.16, 0.74, 0.53)
M_YELLOW  = (0.95, 0.62, 0.18)
M_RED     = (0.94, 0.27, 0.27)
M_DARK    = (0.08, 0.11, 0.20)
M_MUTED   = (0.67, 0.71, 0.78)
M_BG      = (0.97, 0.97, 0.98)


# ── Database ─────────────────────────────────────────────────────────────────

def _connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise EnvironmentError("DATABASE_URL is not set")
    return psycopg2.connect(url)


def _load_data(filters: dict):
    """Run all report queries in a single connection and return a data bundle."""
    city        = filters.get("city") or None
    zip_code    = filters.get("zip") or None
    min_roi     = int(filters["min_roi"]) if filters.get("min_roi") else None
    max_year    = int(filters["max_year_built"]) if filters.get("max_year_built") else None
    listing_type = filters.get("listing_type") or "for_sale"

    # Build a reusable WHERE clause for candidate queries
    conds  = ["listing_type = %s"]
    params = [listing_type]
    if city:
        conds.append("city ILIKE %s"); params.append(city)
    if zip_code:
        conds.append("zip = %s"); params.append(zip_code)
    if min_roi is not None:
        conds.append("opportunity_result >= %s"); params.append(min_roi)
    if max_year is not None:
        conds.append("year_built <= %s"); params.append(max_year)

    where = "WHERE " + " AND ".join(conds) if conds else ""

    conn = _connect()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:

            # ── KPIs ──────────────────────────────────────────────────────
            cur.execute("SELECT COUNT(*) AS n FROM properties")
            total_properties = cur.fetchone()["n"]

            cur.execute(
                f"SELECT COUNT(*) AS n FROM properties {where} AND opportunity_result > 0",
                params,
            )
            total_candidates = cur.fetchone()["n"]

            cur.execute(
                f"""SELECT ROUND(AVG(opportunity_result::float / NULLIF(list_price,0) * 100)::numeric, 1) AS avg_pct
                    FROM properties {where} AND opportunity_result > 0 AND list_price > 0""",
                params,
            )
            avg_pct = float(cur.fetchone()["avg_pct"] or 0)

            # ── Active model ──────────────────────────────────────────────
            cur.execute(
                """SELECT r2_score, started_at, completed_at,
                          properties_trained, training_context->>'algorithm' AS algorithm
                   FROM model_runs
                   WHERE is_active = TRUE
                   LIMIT 1"""
            )
            model_row = cur.fetchone()

            # ── Last run ──────────────────────────────────────────────────
            cur.execute(
                """SELECT run_type, status, started_at, completed_at,
                          properties_trained, properties_scored
                   FROM model_runs ORDER BY started_at DESC LIMIT 1"""
            )
            last_run = cur.fetchone()

            # ── Top 20 candidates ─────────────────────────────────────────
            cur.execute(
                f"""SELECT address, city, zip, year_built, sqft,
                           list_price, predicted_rebuild_value,
                           opportunity_result, construction_cost_per_sqft,
                           lat, lng
                    FROM properties
                    {where} AND opportunity_result IS NOT NULL
                    ORDER BY opportunity_result DESC
                    LIMIT 20""",
                params,
            )
            top20 = cur.fetchall()

            # ── Map points (up to 500 scored candidates) ──────────────────
            cur.execute(
                f"""SELECT lat, lng, opportunity_result
                    FROM properties
                    {where} AND opportunity_result IS NOT NULL
                          AND lat IS NOT NULL AND lng IS NOT NULL
                    ORDER BY opportunity_result DESC
                    LIMIT 500""",
                params,
            )
            map_points = cur.fetchall()

            # ── City breakdown ────────────────────────────────────────────
            cur.execute(
                f"""SELECT city, COUNT(*) AS n
                    FROM properties
                    {where} AND opportunity_result > 0
                    GROUP BY city ORDER BY n DESC LIMIT 8""",
                params,
            )
            city_breakdown = cur.fetchall()

    finally:
        conn.close()

    return {
        "total_properties":  total_properties,
        "total_candidates":  total_candidates,
        "avg_pct":           avg_pct,
        "model":             model_row,
        "last_run":          last_run,
        "top20":             top20,
        "map_points":        map_points,
        "city_breakdown":    city_breakdown,
        "filters":           filters,
        "listing_type":      listing_type,
        "generated_at":      datetime.now(timezone.utc),
    }


# ── Matplotlib figures ────────────────────────────────────────────────────────

def _tier_color(val):
    if val is None:   return M_MUTED
    if val > 200_000: return M_GREEN
    if val >= 0:      return M_YELLOW
    return M_RED


def _make_map_png(map_points) -> io.BytesIO:
    """Scatter plot of candidate lat/lng, color-coded by opportunity tier."""
    fig, ax = plt.subplots(figsize=(16 / 2.54, 9 / 2.54), dpi=150)
    fig.patch.set_facecolor("white")
    ax.set_facecolor(M_BG)

    if map_points:
        lngs  = [float(p["lng"]) for p in map_points]
        lats  = [float(p["lat"]) for p in map_points]
        cols  = [_tier_color(p["opportunity_result"]) for p in map_points]
        sizes = [max(8, min(60, abs(float(p["opportunity_result"] or 0)) / 10_000)) for p in map_points]

        ax.scatter(lngs, lats, c=cols, s=sizes, alpha=0.75, linewidths=0.3,
                   edgecolors="white", zorder=3)

        # Padding
        lng_pad = (max(lngs) - min(lngs)) * 0.05 or 0.05
        lat_pad = (max(lats) - min(lats)) * 0.05 or 0.05
        ax.set_xlim(min(lngs) - lng_pad, max(lngs) + lng_pad)
        ax.set_ylim(min(lats) - lat_pad, max(lats) + lat_pad)
    else:
        ax.text(0.5, 0.5, "No map data", ha="center", va="center",
                transform=ax.transAxes, color=M_MUTED, fontsize=10)

    ax.set_xlabel("Longitude", fontsize=7, color=M_MUTED)
    ax.set_ylabel("Latitude",  fontsize=7, color=M_MUTED)
    ax.tick_params(labelsize=6, colors=M_MUTED)
    ax.grid(True, color="white", linewidth=0.5, alpha=0.8)
    for spine in ax.spines.values():
        spine.set_edgecolor(M_MUTED)
        spine.set_linewidth(0.5)

    legend_patches = [
        mpatches.Patch(color=M_GREEN,  label="High  (>$200 k)"),
        mpatches.Patch(color=M_YELLOW, label="Mid   ($0–200 k)"),
        mpatches.Patch(color=M_RED,    label="Loss  (<$0)"),
    ]
    ax.legend(handles=legend_patches, fontsize=6, loc="upper right",
              framealpha=0.9, edgecolor=M_MUTED)

    plt.tight_layout(pad=0.5)
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf


def _make_distribution_png(top20) -> io.BytesIO:
    """Horizontal bar chart of the top-20 properties' opportunity values."""
    if not top20:
        fig, ax = plt.subplots(figsize=(14 / 2.54, 6 / 2.54), dpi=150)
        ax.text(0.5, 0.5, "No data", ha="center", va="center",
                transform=ax.transAxes, color=M_MUTED)
    else:
        labels = [
            f"{r['address'][:22]}…" if len(r["address"] or "") > 24 else (r["address"] or "-")
            for r in top20
        ]
        values = [float(r["opportunity_result"] or 0) for r in top20]
        bar_colors = [_tier_color(v) for v in values]

        fig, ax = plt.subplots(figsize=(14 / 2.54, max(5, len(top20) * 0.4) / 2.54), dpi=150)
        fig.patch.set_facecolor("white")
        ax.set_facecolor(M_BG)

        y_pos = np.arange(len(labels))
        bars = ax.barh(y_pos, values, color=bar_colors, height=0.6, zorder=3)
        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels, fontsize=6)
        ax.invert_yaxis()
        ax.set_xlabel("Opportunity ($)", fontsize=7, color=M_MUTED)
        ax.tick_params(labelsize=6, colors=M_MUTED)
        ax.grid(True, axis="x", color="white", linewidth=0.5, alpha=0.8)
        ax.axvline(0, color=M_MUTED, linewidth=0.5)
        for spine in ax.spines.values():
            spine.set_edgecolor(M_MUTED)
            spine.set_linewidth(0.4)

        # Value labels
        for bar, val in zip(bars, values):
            label = f"${val / 1000:.0f}k"
            x = bar.get_width()
            ax.text(x + max(abs(x) * 0.01, 1000), bar.get_y() + bar.get_height() / 2,
                    label, va="center", fontsize=5.5, color=M_DARK)

    plt.tight_layout(pad=0.5)
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=150, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    return buf


# ── Folium HTML map ───────────────────────────────────────────────────────────

def _save_folium_map(map_points, output_html_path: str):
    """
    Saves an interactive Leaflet/Folium map alongside the PDF.
    Each marker is color-coded by opportunity tier (green / orange / red).
    """
    if not map_points:
        return

    center_lat = float(np.mean([float(p["lat"]) for p in map_points]))
    center_lng = float(np.mean([float(p["lng"]) for p in map_points]))

    m = folium.Map(location=[center_lat, center_lng], zoom_start=10,
                   tiles="CartoDB positron")

    def _folium_color(val):
        if val is None:   return "gray"
        if val > 200_000: return "green"
        if val >= 0:      return "orange"
        return "red"

    for p in map_points:
        val = p["opportunity_result"]
        folium.CircleMarker(
            location=[float(p["lat"]), float(p["lng"])],
            radius=6,
            color=_folium_color(val),
            fill=True,
            fill_opacity=0.75,
            popup=folium.Popup(
                f"Opportunity: ${float(val or 0):,.0f}" if val is not None else "Unscored",
                max_width=180,
            ),
        ).add_to(m)

    m.save(output_html_path)
    logger.info(f"[report] Folium map saved → {output_html_path}")


# ── ReportLab helpers ─────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", fontName="Helvetica-Bold",
                                fontSize=18, textColor=C_WHITE,
                                spaceAfter=2, leading=22),
        "subtitle": ParagraphStyle("subtitle", fontName="Helvetica",
                                   fontSize=9, textColor=colors.Color(0.8, 0.85, 1.0),
                                   spaceAfter=0),
        "section": ParagraphStyle("section", fontName="Helvetica-Bold",
                                  fontSize=9, textColor=C_DARK,
                                  spaceBefore=10, spaceAfter=6,
                                  borderPad=0),
        "body": ParagraphStyle("body", fontName="Helvetica",
                               fontSize=8, textColor=C_DARK, leading=11),
        "muted": ParagraphStyle("muted", fontName="Helvetica",
                                fontSize=7, textColor=C_MUTED, leading=10),
        "kpi_val": ParagraphStyle("kpi_val", fontName="Helvetica-Bold",
                                  fontSize=20, textColor=C_DARK, leading=24),
        "kpi_label": ParagraphStyle("kpi_label", fontName="Helvetica-Bold",
                                    fontSize=7, textColor=C_MUTED,
                                    spaceAfter=2),
        "kpi_sub": ParagraphStyle("kpi_sub", fontName="Helvetica",
                                  fontSize=7, textColor=C_MUTED),
        "th": ParagraphStyle("th", fontName="Helvetica-Bold",
                              fontSize=7, textColor=C_WHITE, alignment=TA_LEFT),
        "td": ParagraphStyle("td", fontName="Helvetica",
                              fontSize=7, textColor=C_DARK, leading=10),
        "td_mono": ParagraphStyle("td_mono", fontName="Courier",
                                  fontSize=7, textColor=C_DARK, leading=10),
        "td_right": ParagraphStyle("td_right", fontName="Helvetica",
                                   fontSize=7, textColor=C_DARK,
                                   alignment=TA_RIGHT, leading=10),
    }


def _fmt_money(val):
    if val is None: return "-"
    v = float(val)
    sign = "+" if v > 0 else ""
    return f"{sign}${abs(v):,.0f}"


def _fmt_k(val):
    if val is None: return "-"
    return f"${float(val) / 1000:,.0f}k"


def _fmt_date(dt_val):
    if dt_val is None: return "-"
    return dt_val.strftime("%b %d, %Y %H:%M") if hasattr(dt_val, "strftime") else str(dt_val)[:16]


def _filter_summary(filters: dict) -> str:
    parts = []
    if filters.get("city"):         parts.append(f"City: {filters['city']}")
    if filters.get("zip"):          parts.append(f"ZIP: {filters['zip']}")
    if filters.get("min_roi"):      parts.append(f"Min Opportunity: ${int(filters['min_roi']):,}")
    if filters.get("max_year_built"): parts.append(f"Max Year Built: {filters['max_year_built']}")
    lt = filters.get("listing_type", "for_sale")
    parts.append(f"Type: {lt.replace('_', ' ').title()}")
    return "  ·  ".join(parts) if parts else "All Properties"


# ── PDF builder ───────────────────────────────────────────────────────────────

def _build_pdf(data: dict, output_path: str):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm,  bottomMargin=1.5 * cm,
        title="RE Opportunity Engine - Report",
        author="RE Opportunity Engine",
    )

    W = A4[0] - 3 * cm   # usable width
    S = _styles()
    story = []

    # ── Header banner ─────────────────────────────────────────────────────────
    header_data = [[
        Paragraph("RE <font color='#9db8ff'>Opportunity</font> Engine", S["title"]),
        Paragraph(
            f"Generated {data['generated_at'].strftime('%B %d, %Y  %H:%M UTC')}",
            S["subtitle"],
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.65, W * 0.35])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), C_ACCENT),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",        (1, 0), (1, 0),   "RIGHT"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING",   (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 12),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 4 * mm))

    # Filter context
    story.append(Paragraph(f"Filters applied: {_filter_summary(data['filters'])}", S["muted"]))
    story.append(Spacer(1, 6 * mm))

    # ── KPI cards ─────────────────────────────────────────────────────────────
    model    = data["model"] or {}
    r2       = float(model.get("r2_score") or 0)
    r2_str   = f"{r2:.3f}" if model else "-"

    kpi_items = [
        ("TOTAL PROPERTIES", f"{data['total_properties']:,}",    "All ingested records",  C_ACCENT),
        ("CANDIDATES",       f"{data['total_candidates']:,}",    "Scored above threshold", C_GREEN),
        ("AVG OPPORTUNITY",  f"{data['avg_pct']:.1f}%",          "Result / list price",   C_YELLOW),
        ("MODEL  R²",        r2_str,                             "Active model accuracy", colors.Color(0.55, 0.36, 0.90)),
    ]

    kpi_cells = []
    for label, val, sub, accent in kpi_items:
        cell = Table(
            [[Paragraph(label, S["kpi_label"])],
             [Paragraph(val,   S["kpi_val"])],
             [Paragraph(sub,   S["kpi_sub"])]],
            colWidths=[(W - 3 * 4 * mm) / 4],
        )
        cell.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_BG),
            ("LINEABOVE",     (0, 0), (-1, 0),  3, accent),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("ROUNDEDCORNERS", [4]),
        ]))
        kpi_cells.append(cell)

    kpi_row = Table([kpi_cells], colWidths=[(W - 3 * 4 * mm) / 4] * 4,
                    hAlign="LEFT")
    kpi_row.setStyle(TableStyle([
        ("ALIGN",        (0, 0), (-1, -1), "LEFT"),
        ("VALIGN",       (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(kpi_row)
    story.append(Spacer(1, 6 * mm))

    # ── Model & Last Run ──────────────────────────────────────────────────────
    story.append(Paragraph("MODEL & PIPELINE STATUS", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4 * mm))

    alg = (model.get("algorithm") or "-").upper()
    lr  = data["last_run"] or {}
    meta_data = [
        [Paragraph("Algorithm",          S["muted"]),
         Paragraph(alg,                  S["body"]),
         Paragraph("Last Run Type",      S["muted"]),
         Paragraph((lr.get("run_type") or "-").upper(), S["body"])],
        [Paragraph("R² Score",           S["muted"]),
         Paragraph(r2_str,               S["body"]),
         Paragraph("Last Run Status",    S["muted"]),
         Paragraph((lr.get("status") or "-").upper(), S["body"])],
        [Paragraph("Trained On",         S["muted"]),
         Paragraph(f"{model.get('properties_trained') or '-':,}" if model.get('properties_trained') else "-", S["body"]),
         Paragraph("Scored",             S["muted"]),
         Paragraph(f"{lr.get('properties_scored') or '-':,}" if lr.get('properties_scored') else "-", S["body"])],
        [Paragraph("Training Date",      S["muted"]),
         Paragraph(_fmt_date(model.get("completed_at")), S["body"]),
         Paragraph("Last Run Completed", S["muted"]),
         Paragraph(_fmt_date(lr.get("completed_at")),    S["body"])],
    ]
    meta_tbl = Table(meta_data, colWidths=[W * 0.18, W * 0.32, W * 0.18, W * 0.32])
    meta_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_BG),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_WHITE, C_BG]),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1), 0.3, C_BORDER),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 8 * mm))

    # ── Top-20 Candidates table ───────────────────────────────────────────────
    story.append(Paragraph("TOP 20 CANDIDATES", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4 * mm))

    col_labels = ["#", "Address", "City", "ZIP", "Yr", "Sqft",
                  "List Price", "Predicted", "Opportunity", "Tier"]
    col_w = [W * f for f in [0.04, 0.22, 0.10, 0.07, 0.05, 0.07, 0.10, 0.10, 0.12, 0.06]]

    thead = [Paragraph(h, S["th"]) for h in col_labels]
    rows  = [thead]

    for i, r in enumerate(data["top20"], 1):
        val   = r["opportunity_result"]
        val_f = float(val or 0)
        if val_f > 200_000:   tier, tier_c, val_c = "HIGH",   C_GREEN,  C_GREEN
        elif val_f >= 0:      tier, tier_c, val_c = "MID",    C_YELLOW, C_YELLOW
        else:                 tier, tier_c, val_c = "LOSS",   C_RED,    C_RED

        tier_p = ParagraphStyle("tier_p", parent=S["td"],
                                textColor=tier_c, fontName="Helvetica-Bold")
        val_p  = ParagraphStyle("val_p",  parent=S["td_right"],
                                textColor=val_c,  fontName="Helvetica-Bold")

        addr = (r["address"] or "-")
        if len(addr) > 28: addr = addr[:26] + "…"

        rows.append([
            Paragraph(str(i),                             S["td"]),
            Paragraph(addr,                               S["td"]),
            Paragraph((r["city"] or "-").replace("_"," ").title()[:12], S["td"]),
            Paragraph(str(r["zip"] or "-"),               S["td"]),
            Paragraph(str(r["year_built"] or "-"),        S["td"]),
            Paragraph(f"{int(r['sqft']):,}" if r["sqft"] else "-", S["td"]),
            Paragraph(_fmt_k(r["list_price"]),            S["td_right"]),
            Paragraph(_fmt_k(r["predicted_rebuild_value"]), S["td_right"]),
            Paragraph(_fmt_money(val),                    val_p),
            Paragraph(tier,                               tier_p),
        ])

    cand_tbl = Table(rows, colWidths=col_w, repeatRows=1)
    row_bgs = [C_BG if i % 2 == 0 else C_WHITE for i in range(len(rows))]
    cand_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),   C_ACCENT),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1),  [C_WHITE, C_BG]),
        ("LEFTPADDING",   (0, 0), (-1, -1),  4),
        ("RIGHTPADDING",  (0, 0), (-1, -1),  4),
        ("TOPPADDING",    (0, 0), (-1, -1),  4),
        ("BOTTOMPADDING", (0, 0), (-1, -1),  4),
        ("BOX",           (0, 0), (-1, -1),  0.5, C_BORDER),
        ("INNERGRID",     (0, 0), (-1, -1),  0.3, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1),  "MIDDLE"),
    ]))
    story.append(cand_tbl)
    story.append(Spacer(1, 8 * mm))

    # ── Visualisations ────────────────────────────────────────────────────────
    story.append(Paragraph("PROPERTY LOCATION MAP", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4 * mm))

    map_buf  = _make_map_png(data["map_points"])
    map_img  = Image(map_buf, width=W, height=W * (9 / 16))
    story.append(map_img)
    story.append(Paragraph(
        "Dot size proportional to opportunity magnitude. "
        "Green = High (>$200k) · Orange = Mid ($0–200k) · Red = Loss.",
        S["muted"],
    ))
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("OPPORTUNITY DISTRIBUTION - TOP 20", S["section"]))
    story.append(HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4 * mm))
    dist_buf = _make_distribution_png(data["top20"])
    dist_img = Image(dist_buf, width=W, height=W * 0.55)
    story.append(dist_img)

    # ── Footer note ───────────────────────────────────────────────────────────
    story.append(Spacer(1, 6 * mm))
    story.append(HRFlowable(width=W, thickness=0.3, color=C_BORDER))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "This report is generated automatically by the RE Opportunity Engine. "
        "Opportunity values represent estimated profit from land acquisition + rebuild strategy. "
        "An interactive map (HTML) is included alongside this PDF.",
        S["muted"],
    ))

    doc.build(story)
    logger.info(f"[report] PDF saved → {output_path}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate PDF opportunity report")
    parser.add_argument("--job-id",  required=True)
    parser.add_argument("--output",  required=True, help="Output PDF path")
    parser.add_argument("--filters", default="{}", help="JSON filter string")
    args = parser.parse_args()

    try:
        filters = json.loads(args.filters)
    except json.JSONDecodeError as e:
        logger.error(f"[report] Invalid --filters JSON: {e}")
        sys.exit(1)

    logger.info(f"[report] Starting job {args.job_id} | filters={filters}")

    try:
        data = _load_data(filters)
        logger.info(
            f"[report] Loaded data: {data['total_properties']} properties, "
            f"{data['total_candidates']} candidates, {len(data['top20'])} top candidates"
        )
    except Exception as e:
        logger.error(f"[report] DB error: {e}")
        sys.exit(1)

    try:
        _build_pdf(data, args.output)
    except Exception as e:
        logger.error(f"[report] PDF generation failed: {e}", exc_info=True)
        sys.exit(1)

    # Save companion Folium HTML map
    html_path = args.output.replace(".pdf", "_map.html")
    try:
        _save_folium_map(data["map_points"], html_path)
    except Exception as e:
        logger.warning(f"[report] Folium map skipped: {e}")

    logger.info(f"[report] Done - job {args.job_id}")


if __name__ == "__main__":
    main()
