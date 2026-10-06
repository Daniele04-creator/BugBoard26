"""Build the public technical PDF without private planning files."""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup, NavigableString, Tag
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak, NextPageTemplate, Table, TableStyle, Image
from reportlab.platypus.tableofcontents import TableOfContents
from svglib.svglib import svg2rlg

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public-artifacts"
WIDTH = A4[0] - 36 * mm
HEIGHT = A4[1] - 36 * mm


def safe_text(value: str) -> str:
    """Normalize typography and spell out unsupported illustrative glyphs."""
    return value.translate(str.maketrans({"–": "-", "—": "-", "‑": "-", "→": " -> ", "↔": " <-> ", "≤": "<=", "≥": ">=", "✓": "PASS", "×": " x ", "…": "...", "ω": "[U+03C9]"}))


def markup(node: Tag | NavigableString) -> str:
    if isinstance(node, NavigableString):
        return html.escape(safe_text(str(node)))
    children = "".join(markup(child) for child in node.children)
    if node.name in ("strong", "b"):
        return f"<b>{children}</b>"
    if node.name in ("em", "i"):
        return f"<i>{children}</i>"
    if node.name == "br":
        return "<br/>"
    if node.name == "code":
        return children
    if node.name == "a" and str(node.get("href", "")).startswith(("https://", "http://")):
        return f'<link href="{html.escape(node["href"], quote=True)}" color="#126961">{children}</link>'
    return children


def evidence_html() -> str:
    snapshot = json.loads((PUBLIC / "evidence.json").read_text(encoding="utf-8"))
    body = f'<p>Snapshot: {html.escape(snapshot["measuredAt"])}. La ripetizione dei gate sulla revisione finale è necessaria quando cambia il codice interessato.</p>'
    body += "<table><thead><tr><th>Controllo</th><th>Esito misurato</th><th>Evidenza / limite</th></tr></thead><tbody>"
    for item in snapshot["checks"]:
        body += "<tr>" + "".join(f"<td>{html.escape(item[key])}</td>" for key in ("check", "status", "evidence")) + "</tr>"
    body += "</tbody></table>"
    try:
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        count = subprocess.check_output(["git", "rev-list", "--count", "HEAD"], cwd=ROOT, text=True).strip()
        authors = subprocess.check_output(["git", "shortlog", "-sn", "HEAD"], cwd=ROOT, text=True).splitlines()
        period = subprocess.check_output(["git", "log", "--format=%aI", "--reverse"], cwd=ROOT, text=True).splitlines()
        body += f"<h2>Versioning Git reale al momento della generazione</h2><p>Revisione {revision}; {count} commit; {len(authors)} autori distinti registrati. Periodo: {period[0]} - {period[-1]}. Lo stato locale può comprendere modifiche successive a HEAD; il PDF non attribuisce contributi non registrati.</p>"
        body += "<p>Statistiche complete ripetibili: scripts/report-versioning.ps1; output/reports/versioning/commits.csv e summary.json. Frequenza settimanale derivata dalle date dei commit, senza statistiche inventate.</p>"
    except (subprocess.CalledProcessError, FileNotFoundError, IndexError):
        body += "<h2>Versioning</h2><p>NON VERIFICATO: storia Git non disponibile in questa copia.</p>"
    return body


def prepare_html() -> BeautifulSoup:
    soup = BeautifulSoup((PUBLIC / "technical-document.template.html").read_text(encoding="utf-8"), "html.parser")
    for text in list(soup.find(id="overview").find_all(string=True)):
        if str(text).startswith("Sorgente editabile del documento tecnico."):
            text.replace_with("Documento pubblico completo con evidenze e schermate reali. I criteri descrivono il comportamento richiesto; il capitolo Evidenze riporta esclusivamente misure effettive. Sono escluse istruzioni accademiche e prove con persone reali.")
    try:
        input_revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())
    except (subprocess.CalledProcessError, FileNotFoundError):
        input_revision, dirty = "NON DISPONIBILE", None
    snapshot = soup.new_tag("p")
    snapshot["id"] = "generation-snapshot"
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    dirty_text = "sì" if dirty else "no" if dirty is False else "NON DISPONIBILE"
    snapshot.string = f"Snapshot generato {timestamp}; revisione Git di input {input_revision}; modifiche locali presenti: {dirty_text}. La revisione è quella letta prima dell’eventuale commit di questo snapshot pubblico."
    soup.find(id="overview").append(snapshot)
    soup.find(id="evidence-content").append(BeautifulSoup(evidence_html(), "html.parser"))
    target = soup.find(id="screenshot-content")
    manifest = json.loads((PUBLIC / "manifest.json").read_text(encoding="utf-8"))
    for shot in manifest["screenshots"]:
        path = PUBLIC / "screenshots" / shot["file"]
        if path.exists():
            target.append(BeautifulSoup(f'<figure><img src="screenshots/{shot["file"]}" alt="{shot["title"]}"><figcaption>{shot["title"]}. Screenshot reale del browser, non mockup simulato.</figcaption></figure>', "html.parser"))
        else:
            target.append(BeautifulSoup(f'<p>{shot["title"]}: screenshot NON DISPONIBILE in questa copia.</p>', "html.parser"))
    return soup


class TechnicalDocument(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name.startswith("Heading"):
            level = int(flowable.style.name[-1]) - 1
            if level <= 1:
                key = getattr(flowable, "bookmark", f"heading-{self.seq.nextf('heading')}")
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(flowable.getPlainText(), key, level=level, closed=True)
                self.notify("TOCEntry", (level, flowable.getPlainText(), self.page, key))


def build(output: Path, publish_html: bool = False) -> dict:
    for name, filename in (("Vera", "Vera.ttf"), ("Vera-Bold", "VeraBd.ttf"), ("Vera-Italic", "VeraIt.ttf"), ("Vera-BoldItalic", "VeraBI.ttf")):
        pdfmetrics.registerFont(TTFont(name, str(PUBLIC / "fonts" / filename)))
    pdfmetrics.registerFontFamily("Vera", normal="Vera", bold="Vera-Bold", italic="Vera-Italic", boldItalic="Vera-BoldItalic")
    styles = getSampleStyleSheet()
    for name in ("Normal", "BodyText"):
        styles[name].fontName = "Vera"
        styles[name].fontSize = 9
        styles[name].leading = 13
        styles[name].spaceAfter = 7
        styles[name].splitLongWords = True
    for i, size in ((1, 19), (2, 13), (3, 10.5)):
        styles[f"Heading{i}"].fontName = "Vera-Bold"
        styles[f"Heading{i}"].fontSize = size
        styles[f"Heading{i}"].leading = size * 1.25
        styles[f"Heading{i}"].textColor = colors.HexColor("#145f5b")
        styles[f"Heading{i}"].spaceBefore = 13
        styles[f"Heading{i}"].spaceAfter = 9
    cell = ParagraphStyle("Cell", parent=styles["Normal"], fontSize=7.3, leading=10, spaceAfter=0)
    code = ParagraphStyle("Code", parent=styles["Normal"], fontSize=7.4, leading=10, backColor=colors.HexColor("#f2f6f7"), borderPadding=7, spaceAfter=10)
    caption = ParagraphStyle("Caption", parent=styles["Normal"], fontSize=8, leading=11, textColor=colors.HexColor("#425a67"))
    story = []

    def paragraph(text, style="Normal"):
        return Paragraph(text or " ", styles[style])

    def emit(node):
        if not isinstance(node, Tag):
            return
        if node.name in ("header", "section", "div", "blockquote"):
            if node.name == "section":
                story.append(PageBreak())
            for child in node.children:
                emit(child)
        elif node.name == "nav":
            story.append(PageBreak())
            story.append(paragraph("Indice", "Heading1"))
            toc = TableOfContents()
            toc.levelStyles = [ParagraphStyle("TOC0", fontName="Vera", fontSize=10, leading=15, spaceBefore=7), ParagraphStyle("TOC1", fontName="Vera", fontSize=8.5, leading=12, leftIndent=12)]
            story.append(toc)
        elif node.name in ("h1", "h2", "h3", "h4"):
            p = paragraph(markup(node), f"Heading{min(int(node.name[1]), 3)}")
            p.bookmark = node.get("id", f"section-{len(story)}")
            story.append(p)
        elif node.name == "p":
            story.append(paragraph(markup(node)))
        elif node.name in ("ul", "ol"):
            for index, li in enumerate(node.find_all("li", recursive=False), 1):
                prefix = f"{index}. " if node.name == "ol" else "- "
                story.append(paragraph(prefix + markup(li)))
        elif node.name == "pre":
            for line in node.get_text().splitlines():
                # Each line may wrap and split across pages; no clipped Preformatted blocks.
                story.append(Paragraph(html.escape(safe_text(line)).replace(" ", "&#160;"), code))
        elif node.name == "table":
            rows = []
            for tr in node.find_all("tr"):
                rows.append([Paragraph(markup(td), cell) for td in tr.find_all(["th", "td"], recursive=False)])
            if rows:
                columns = max(map(len, rows))
                for row in rows:
                    row.extend(Paragraph(" ", cell) for _ in range(columns - len(row)))
                widths = [WIDTH / columns] * columns
                if columns >= 3:
                    widths = [WIDTH * .14] + [WIDTH * .86 / (columns - 1)] * (columns - 1)
                table = Table(rows, colWidths=widths, repeatRows=1, splitByRow=1, splitInRow=1, hAlign="LEFT")
                table.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BACKGROUND", (0,0),(-1,0), colors.HexColor("#e9f1f2")), ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f7f9fa")]),("GRID",(0,0),(-1,-1),.3,colors.HexColor("#c7d4d9")),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
                story.extend([table, Spacer(1, 10)])
        elif node.name == "figure":
            img = node.find("img")
            if img:
                path = PUBLIC / img["src"]
                if not path.exists():
                    raise FileNotFoundError(path)
                if path.suffix == ".svg":
                    drawing = svg2rlg(str(path))
                    wide = drawing.width / drawing.height > 1.35
                    available_width, available_height = (HEIGHT, WIDTH) if wide else (WIDTH, HEIGHT)
                    story.extend([NextPageTemplate("landscape" if wide else "technical"), PageBreak()])
                    factor = min(available_width / drawing.width, (available_height - 20 * mm) / drawing.height)
                    drawing.scale(factor, factor)
                    drawing.width *= factor
                    drawing.height *= factor
                    story.append(drawing)
                else:
                    image = Image(str(path))
                    wide = image.imageWidth / image.imageHeight > 1.35
                    available_width, available_height = (HEIGHT, WIDTH) if wide else (WIDTH, HEIGHT)
                    story.extend([NextPageTemplate("landscape" if wide else "technical"), PageBreak()])
                    factor = min(available_width / image.imageWidth, (available_height - 20 * mm) / image.imageHeight)
                    image.drawWidth = image.imageWidth * factor
                    image.drawHeight = image.imageHeight * factor
                    story.append(image)
                if node.find("figcaption"):
                    story.append(Paragraph(markup(node.find("figcaption")), caption))
                story.append(NextPageTemplate("technical"))
        elif node.name == "hr":
            story.append(Spacer(1, 8))
        elif node.name not in ("script", "style"):
            for child in node.children:
                emit(child)

    soup = prepare_html()
    if publish_html:
        (PUBLIC / "technical-document.html").write_text(str(soup), encoding="utf-8", newline="\n")
    for child in soup.body.children:
        emit(child)
    output.parent.mkdir(parents=True, exist_ok=True)
    doc = TechnicalDocument(str(output), pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title="BugBoard26 - Documentazione tecnica", author="BugBoard26", allowSplitting=True)

    def page(canvas, document):
        canvas.saveState()
        canvas.setFont("Vera", 7)
        canvas.setFillColor(colors.HexColor("#425a67"))
        canvas.drawString(18*mm, 10*mm, "BugBoard26 | Requisiti, design e verifica")
        canvas.drawRightString(canvas._pagesize[0]-18*mm, 10*mm, str(document.page))
        canvas.restoreState()

    doc.addPageTemplates(PageTemplate(id="technical", frames=Frame(18*mm,18*mm,WIDTH,HEIGHT,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0), onPage=page))
    doc.addPageTemplates(PageTemplate(id="landscape", pagesize=landscape(A4), frames=Frame(18*mm,18*mm,HEIGHT,WIDTH,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0), onPage=page))
    doc.multiBuild(story)
    expanded = output.with_suffix(".html")
    stylesheet = soup.find("link", rel="stylesheet")
    if stylesheet:
        style = soup.new_tag("style")
        style.string = (PUBLIC / "technical-document.css").read_text(encoding="utf-8")
        stylesheet.replace_with(style)
    for img in soup.find_all("img", src=True):
        path = PUBLIC / img["src"]
        media = "image/svg+xml" if path.suffix == ".svg" else "image/png"
        img["src"] = f"data:{media};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    expanded.write_text(str(soup), encoding="utf-8", newline="\n")
    reader = PdfReader(output)
    result = {"generatedAt":datetime.now(timezone.utc).isoformat(),"pdf":str(output.relative_to(ROOT)),"pages":len(reader.pages),"sha256":hashlib.sha256(output.read_bytes()).hexdigest(),"visualInspection":"REQUIRED: render and inspect before delivery"}
    output.with_suffix(".json").write_text(json.dumps(result,indent=2),encoding="utf-8",newline="\n")
    return result


def verify() -> dict:
    soup = prepare_html()
    text = soup.get_text(" ")
    manifest = json.loads((PUBLIC / "manifest.json").read_text(encoding="utf-8"))
    errors = []
    allowed_tags = set("html head meta title link body header h1 h2 h3 h4 h5 h6 p nav a section table thead tbody tr th td div ul ol li pre code strong em figure img figcaption blockquote hr br".split())
    unexpected_tags = sorted({tag.name for tag in soup.find_all()} - allowed_tags)
    if unexpected_tags:
        errors.append(f"Unexpected HTML tags; escape technical type parameters: {unexpected_tags}")
    published = BeautifulSoup((PUBLIC / "technical-document.html").read_text(encoding="utf-8"), "html.parser")
    for section_id in ("evidence-content", "screenshot-content"):
        section = published.find(id=section_id)
        if section is None or not section.get_text(strip=True):
            errors.append(f"Published HTML incomplete: {section_id}")
    screenshot_section = published.find(id="screenshot-content")
    if screenshot_section is None or len(screenshot_section.find_all("figure")) != 3:
        errors.append("Published HTML must contain the three real screenshots")
    coverage = {}
    for prefix, count in manifest["requiredIds"].items():
        found = set(re.findall(rf"\b{prefix}-\d{{2}}\b", text))
        expected = {f"{prefix}-{i:02}" for i in range(1,count+1)}
        coverage[prefix] = len(found)
        if not expected.issubset(found):
            errors.append(f"Missing {prefix}: {sorted(expected-found)}")
    identifiers = {tag["id"] for tag in soup.find_all(id=True)}
    for a in soup.find_all("a",href=True):
        if a["href"].startswith("#") and a["href"][1:] not in identifiers:
            errors.append(f"Broken anchor {a['href']}")
    for img in soup.find_all("img",src=True):
        if not (PUBLIC / img["src"]).is_file():
            errors.append(f"Missing image {img['src']}")
    models = list((PUBLIC / "uml").glob("*.puml"))
    if len(models) != 8:
        errors.append("Expected eight editable UML models")
    for model in models:
        body = model.read_text(encoding="utf-8")
        if "@startuml" not in body or "@enduml" not in body:
            errors.append(f"Malformed UML {model.name}")
        svg = model.with_suffix(".svg")
        if not svg.exists():
            errors.append(f"Missing UML rendering {svg.name}")
        else:
            ET.parse(svg)
            if "Syntax Error" in svg.read_text(encoding="utf-8"):
                errors.append(f"UML rendering contains a syntax error: {svg.name}")
    result = {"coverage":coverage,"editableUml":len(models),"errors":errors}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if errors:
        raise SystemExit(1)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify",action="store_true")
    parser.add_argument("--publish-html",action="store_true",help="Update the complete public HTML snapshot before committing documentation sources")
    parser.add_argument("--output",type=Path,default=ROOT/"output/documentation/BugBoard26-documentazione.pdf")
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        verify()
        print(json.dumps(build(args.output.resolve(), args.publish_html),ensure_ascii=False,indent=2))
