#!/usr/bin/env python3
"""Render the agent Markdown guide to a readable PDF (requires reportlab)."""
import argparse
from html import escape
from pathlib import Path
import re
import textwrap

from reportlab import rl_config
from reportlab.graphics.shapes import Drawing, Line, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, Image, KeepTogether, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
NAVY = colors.HexColor('#18333B')
TEAL = colors.HexColor('#126B64')
MUTED = colors.HexColor('#52656B')
PALE = colors.HexColor('#EDF4F2')
LINE = colors.HexColor('#C9D9D5')
WIDTH, HEIGHT = A4
MARGIN = 52
CONTENT = WIDTH - 2 * MARGIN


def fonts():
    base = Path('/usr/share/fonts/truetype/dejavu')
    if base.exists():
        for name, file in [('Body', 'DejaVuSans.ttf'), ('BodyBold', 'DejaVuSans-Bold.ttf'),
                           ('Mono', 'DejaVuSansMono.ttf')]:
            pdfmetrics.registerFont(TTFont(name, str(base / file)))
        pdfmetrics.registerFontFamily('Body', normal='Body', bold='BodyBold', italic='Body', boldItalic='BodyBold')
    else:
        from reportlab.pdfbase.pdfmetrics import Font
        for name, face in [('Body', 'Helvetica'), ('BodyBold', 'Helvetica-Bold'), ('Mono', 'Courier')]:
            pdfmetrics.registerFont(Font(name, face, 'WinAnsiEncoding'))


def inline(text):
    """Only the deliberate, small Markdown subset used by this report."""
    parts = re.split(r'(`[^`]+`|\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*)', text)
    out = []
    for part in parts:
        if part.startswith('`') and part.endswith('`'):
            out.append('<font name="Mono" size="8.1">' + escape(part[1:-1]) + '</font>')
        elif part.startswith('**') and part.endswith('**'):
            out.append('<b>' + escape(part[2:-2]) + '</b>')
        elif re.match(r'^\[[^\]]+\]\([^\)]+\)$', part):
            label, url = re.match(r'^\[([^\]]+)\]\(([^\)]+)\)$', part).groups()
            out.append('<a href="' + escape(url, quote=True) + '" color="#126B64">' + escape(label) + '</a>')
        else:
            out.append(escape(part))
    return ''.join(out)


def architecture():
    d = Drawing(CONTENT, 265)
    def box(x, y, w, title, subtitle='', fill=PALE):
        d.add(Rect(x, y, w, 43, rx=5, ry=5, fillColor=fill, strokeColor=LINE, strokeWidth=.7))
        d.add(String(x+w/2, y+25, title, textAnchor='middle', fontName='BodyBold', fontSize=9, fillColor=NAVY))
        if subtitle:
            d.add(String(x+w/2, y+11, subtitle, textAnchor='middle', fontName='Body', fontSize=7.6, fillColor=MUTED))
    def arrow(x1, y1, x2, y2):
        d.add(Line(x1, y1, x2, y2, strokeColor=TEAL, strokeWidth=1.2))
        if x1 == x2:
            d.add(Polygon([x2-3,y2+5,x2+3,y2+5,x2,y2],fillColor=TEAL,strokeColor=TEAL))
        else:
            direction = 1 if x2 > x1 else -1
            d.add(Polygon([x2-direction*5,y2-3,x2-direction*5,y2+3,x2,y2],fillColor=TEAL,strokeColor=TEAL))
    c = CONTENT/2
    box(c-110, 217, 220, 'JavaScript chat app', 'Draft, scroll, explicit approval')
    box(c-110, 153, 220, 'JavaScript agent service', 'Context, tools, retries, limits')
    arrow(c,217,c,196)
    box(c-110,89,220,'Native transport and store','Claims, tickets, credentials, bounded I/O')
    arrow(c,153,c,132)
    box(0,25,155,'Linux backend','Fixtures or verified libcurl')
    box(CONTENT-205,25,205,'P4 worker + C6 radio','HTTP / TLS / SDIO / Wi-Fi')
    arrow(c-65,89,77.5,68)
    arrow(c+65,89,CONTENT-102.5,68)
    d.add(String(c,2,'Both live paths call the OpenAI Responses API.',textAnchor='middle',fontName='Body',fontSize=8.3,fillColor=MUTED))
    return d


class Report(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(str(path), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=55, bottomMargin=49, title='A real agent on the PicoCalc - Implementation guide and report',
            author='Engineering implementation report', pageCompression=1)
        self.addPageTemplates(PageTemplate(id='normal', frames=[Frame(MARGIN,49,CONTENT,HEIGHT-104,
            leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)], onPage=self.page))
    def page(self, canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setStrokeColor(LINE); canvas.setLineWidth(.5)
            canvas.line(MARGIN,HEIGHT-35,WIDTH-MARGIN,HEIGHT-35)
            canvas.setFillColor(MUTED); canvas.setFont('Body',7.4)
            canvas.drawString(MARGIN,HEIGHT-26,'PICOCALC AGENT  /  IMPLEMENTATION GUIDE')
            canvas.drawRightString(WIDTH-MARGIN,HEIGHT-26,'OCTOBER 2026')
        canvas.setFillColor(MUTED); canvas.setFont('Body',7.4)
        canvas.drawString(MARGIN,29,'JS agent + native HTTPS  |  ESP32-P4 / ESP32-C6')
        canvas.drawRightString(WIDTH-MARGIN,29,str(doc.page))
        canvas.restoreState()
    def afterFlowable(self, item):
        if isinstance(item, Paragraph) and item.style.name == 'H1':
            title = item.getPlainText()
            key = 'section-' + re.sub('[^a-z0-9]+','-', title.lower())
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(title,key,level=0,closed=False)
            self.notify('TOCEntry',(0,title,self.page,key))


def styles():
    body = ParagraphStyle('Body',fontName='Body',fontSize=9.6,leading=14,spaceAfter=7.5,textColor=NAVY,
                          splitLongWords=True,allowWidows=0,allowOrphans=0)
    return {
        'body':body,
        'h1':ParagraphStyle('H1',parent=body,fontName='BodyBold',fontSize=17,leading=21,spaceBefore=17,spaceAfter=10,keepWithNext=True),
        'h2':ParagraphStyle('H2',parent=body,fontName='BodyBold',fontSize=11.4,leading=15,spaceBefore=11,spaceAfter=6,keepWithNext=True),
        'bullet':ParagraphStyle('Bullet',parent=body,leftIndent=13,firstLineIndent=-11,spaceAfter=5),
        'cell':ParagraphStyle('Cell',parent=body,fontSize=8.1,leading=11.3,spaceAfter=0,allowWidows=1,allowOrphans=1),
        'head':ParagraphStyle('Head',parent=body,fontName='BodyBold',fontSize=8.1,leading=11.3,spaceAfter=0,textColor=colors.white),
        'code':ParagraphStyle('Code',parent=body,fontName='Mono',fontSize=7.7,leading=10.5,spaceAfter=0,allowWidows=1,allowOrphans=1),
        'caption':ParagraphStyle('Caption',parent=body,fontSize=8.1,leading=11.5,textColor=MUTED,spaceBefore=4,spaceAfter=12),
    }


def markdown_blocks(text, base, st):
    lines = text.splitlines()
    start = next(i for i,l in enumerate(lines) if l.startswith('## 1.'))
    i = start
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1; continue
        if line.startswith('```'):
            language = line[3:].strip(); body=[]; i+=1
            while i<len(lines) and not lines[i].startswith('```'):
                body.append(lines[i]); i+=1
            i+=1
            if language=='mermaid':
                yield KeepTogether([architecture(),Spacer(1,8)])
            else:
                rendered=[]
                for l in body:
                    for part in textwrap.wrap(l, width=101, subsequent_indent='    ',replace_whitespace=False,
                                             drop_whitespace=False,break_long_words=True,break_on_hyphens=False) or [' ']:
                        rendered.append(escape(part).replace(' ','&#160;'))
                p=Paragraph('<br/>'.join(rendered),st['code'])
                table=Table([[p]],colWidths=[CONTENT],style=TableStyle([
                    ('BACKGROUND',(0,0),(-1,-1),PALE),('BOX',(0,0),(-1,-1),.5,LINE),
                    ('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),
                    ('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9)]))
                table.spaceBefore=3; table.spaceAfter=10
                yield table
        elif line.startswith('### '):
            yield Paragraph(inline(line[4:]),st['h2']); i+=1
        elif line.startswith('## '):
            following = i + 1
            while following < len(lines) and not lines[following].strip():
                following += 1
            if following < len(lines) and lines[following].strip() == '```mermaid':
                # Keep the section heading with the fixed-height architecture figure.
                yield CondPageBreak(330)
            yield Paragraph(inline(line[3:]),st['h1']); i+=1
        elif line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+',c) for c in row): rows.append(row)
                i+=1
            n=max(len(r) for r in rows)
            # Commands can contain a literal pipe; this report escapes them in prose instead.
            assert all(len(r)==n for r in rows), rows
            widths=[CONTENT*.32,CONTENT*.68] if n==2 else [CONTENT*.25,CONTENT*.33,CONTENT*.42] if n==3 else [CONTENT/n]*n
            cells=[[Paragraph(inline(c),st['head'] if index==0 else st['cell']) for c in row] for index,row in enumerate(rows)]
            table=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([
                ('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,PALE]),
                ('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,0),.6,NAVY),
                ('LINEBELOW',(0,1),(-1,-1),.3,LINE),('LEFTPADDING',(0,0),(-1,-1),7),
                ('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),
                ('BOTTOMPADDING',(0,0),(-1,-1),7)]))
            table.spaceBefore=3; table.spaceAfter=12
            yield table
        elif line.startswith('!['):
            match=re.fullmatch(r'!\[([^\]]*)\]\(([^\)]+)\)',line)
            img=Image(str(base / match.group(2)),width=292,height=292)
            img.hAlign='CENTER'
            caption=None; j=i+1
            while j<len(lines) and not lines[j].strip(): j+=1
            if j<len(lines) and lines[j].startswith('*Figure'):
                caption=Paragraph(inline(lines[j].strip('*')),st['caption']); i=j
            yield KeepTogether([img]+([caption] if caption else [])); i+=1
        elif re.match(r'^(?:- |\d+\. )',line):
            match=re.match(r'^(-|\d+\.)\s+(.*)',line)
            marker='•' if match.group(1)=='-' else match.group(1)
            yield Paragraph(marker+' '+inline(match.group(2)),st['bullet']); i+=1
        else:
            para=[line]; i+=1
            while i<len(lines) and lines[i].strip() and not re.match(r'^(?:#|\||```|!\[|- |\d+\. )',lines[i]):
                para.append(lines[i].strip()); i+=1
            yield Paragraph(inline(' '.join(para)),st['body'])


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=ROOT/'docs/picocalc-agent-implementation.md')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(); args.output.parent.mkdir(parents=True,exist_ok=True)
    fonts(); st=styles(); story=[]
    story.append(Spacer(1,42))
    story.append(Paragraph('PICOCALC / ENGINEERING',ParagraphStyle('Eyebrow',fontName='BodyBold',fontSize=10,leading=14,textColor=TEAL,spaceAfter=24)))
    story.append(Paragraph('A real agent<br/>on the PicoCalc',ParagraphStyle('Cover',fontName='BodyBold',fontSize=37,leading=45,textColor=NAVY,spaceAfter=19)))
    story.append(Paragraph('Implementation guide and report',ParagraphStyle('Subtitle',fontName='Body',fontSize=16,leading=22,textColor=TEAL,spaceAfter=22)))
    story.append(Paragraph('JavaScript runs the conversation and tools.<br/>Native workers handle Wi-Fi, TLS, and HTTP.',ParagraphStyle('Deck',parent=st['body'],fontSize=12,leading=18,spaceAfter=25)))
    story.append(Paragraph('IMPLEMENTED  /  BUILT  /  HOST-VALIDATED',ParagraphStyle('Badge',fontName='BodyBold',fontSize=9,leading=13,textColor=TEAL,spaceAfter=14)))
    cover=[['Target','ESP32-P4 PicoCalc + ESP32-C6 radio'],['Runtime','Full QuickJS on device and simulator'],['Repository','wesen/2026-10-20--ds-js-os'],['Baseline','3e0bcfa60f370f62aae9ee1ce8402d6bba1ff05d'],['Branch','feat/picocalc-agent'],['Prepared','October 30, 2026 / America/New_York']]
    story.append(Table([[Paragraph(a,st['cell']),Paragraph(inline('`'+b+'`') if a in ['Baseline','Branch'] else escape(b),st['cell'])] for a,b in cover],colWidths=[78,CONTENT-78],style=TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.35,LINE),
        ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),8),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)])))
    story.append(Spacer(1,24))
    story.append(Paragraph('Live provider access and physical hardware remain acceptance steps. The report distinguishes those limits from passing simulator, TLS, sanitizer and firmware-build evidence.',st['body']))
    story.append(PageBreak())
    story.append(Paragraph('Contents',ParagraphStyle('ContentsTitle',parent=st['h1'],spaceBefore=5)))
    toc=TableOfContents(); toc.levelStyles=[ParagraphStyle('TOC',fontName='Body',fontSize=10,leading=17,leftIndent=0,firstLineIndent=0,spaceBefore=3,textColor=NAVY)]
    story.append(toc); story.append(PageBreak())
    story.extend(markdown_blocks(args.source.read_text(),args.source.parent,st))
    Report(args.output).multiBuild(story)
    print(args.output)


if __name__=='__main__':
    main()
