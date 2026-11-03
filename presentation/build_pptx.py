"""Build the course defense PowerPoint for AI Sales Manager."""

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

INK = RGBColor(0x0F, 0x17, 0x20)
CARD = RGBColor(0x20, 0x2C, 0x3A)
TEXT = RGBColor(0xF4, 0xF1, 0xEC)
MUTED = RGBColor(0x9A, 0xA6, 0xB2)
ACCENT = RGBColor(0x3D, 0x8B, 0x7A)
GOLD = RGBColor(0xC9, 0xA2, 0x6B)


def set_run(run, size=18, bold=False, color=TEXT, font="Calibri"):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color


def add_bg(slide, color=INK):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    shape.line.fill.background()
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    sp_tree = slide.shapes._spTree
    sp = shape._element
    sp_tree.remove(sp)
    sp_tree.insert(2, sp)
    return shape


def accent_bar(slide, left=Inches(0.7), top=Inches(0.55), width=Inches(0.55), height=Inches(0.08)):
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    bar.line.fill.background()
    bar.fill.solid()
    bar.fill.fore_color.rgb = ACCENT
    return bar


def textbox(slide, left, top, width, height, text, size=18, bold=False, color=TEXT, align=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    set_run(run, size=size, bold=bold, color=color)
    return box


def multiline(slide, left, top, width, height, lines, size=18, color=TEXT, bold=False):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.LEFT
        p.space_after = Pt(8)
        run = p.add_run()
        run.text = line
        set_run(run, size=size, bold=bold, color=color)
    return box


def card(slide, left, top, width, height):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.adjustments[0] = 0.08
    shape.line.fill.background()
    shape.fill.solid()
    shape.fill.fore_color.rgb = CARD
    return shape


def metric_card(slide, left, top, width, height, label, value, note=""):
    card(slide, left, top, width, height)
    textbox(slide, left + Inches(0.25), top + Inches(0.22), width - Inches(0.4), Inches(0.35), label, size=12, color=MUTED)
    textbox(slide, left + Inches(0.25), top + Inches(0.55), width - Inches(0.4), Inches(0.55), value, size=26, bold=True, color=TEXT)
    if note:
        textbox(slide, left + Inches(0.25), top + Inches(1.15), width - Inches(0.4), Inches(0.4), note, size=12, color=ACCENT)


def section_title(slide, kicker, title, subtitle=None):
    add_bg(slide)
    accent_bar(slide)
    textbox(slide, Inches(0.7), Inches(0.7), Inches(11.5), Inches(0.35), kicker.upper(), size=12, bold=True, color=ACCENT)
    textbox(slide, Inches(0.7), Inches(1.05), Inches(11.8), Inches(0.8), title, size=34, bold=True, color=TEXT)
    if subtitle:
        textbox(slide, Inches(0.7), Inches(1.85), Inches(11.5), Inches(0.6), subtitle, size=16, color=MUTED)


# 1 Title
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
panel = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.18), prs.slide_height)
panel.line.fill.background()
panel.fill.solid()
panel.fill.fore_color.rgb = ACCENT
textbox(slide, Inches(0.9), Inches(1.6), Inches(11), Inches(0.4), "SOFTWARE ENGINEERING  ·  AI-ASSISTED DEVELOPMENT", size=13, bold=True, color=ACCENT)
textbox(slide, Inches(0.9), Inches(2.2), Inches(11.5), Inches(1.2), "AI Sales Manager", size=54, bold=True, color=TEXT)
textbox(
    slide,
    Inches(0.9),
    Inches(3.5),
    Inches(10.5),
    Inches(1.0),
    "An AI sales workspace for Tunisian ecommerce.\nCatalog-grounded answers in French, Arabic, and Derja — with a human handoff when it is time to buy.",
    size=18,
    color=MUTED,
)
textbox(slide, Inches(0.9), Inches(5.6), Inches(11), Inches(0.4), "Team  ·  Rayen  ·  Aymen  ·  Moataz  ·  Asma", size=14, color=GOLD)
textbox(slide, Inches(0.9), Inches(6.1), Inches(11), Inches(0.35), "github.com/R2W1cs/ai_sales_manager", size=13, color=MUTED)

# 2 Agenda
section_title(prs.slides.add_slide(prs.slide_layouts[6]), "Agenda", "What we will cover", "From the problem to measured proof.")
slide = prs.slides[-1]
items = [
    ("01", "The problem in Tunisian ecommerce"),
    ("02", "Product vision and MVP scope"),
    ("03", "Architecture and stack"),
    ("04", "Product walkthrough"),
    ("05", "AI behaviour and Derja support"),
    ("06", "Testing evidence"),
    ("07", "Refactoring and optimization"),
    ("08", "Demo, team, and how to run it"),
]
for i, (num, label) in enumerate(items):
    col = i // 4
    row = i % 4
    left = Inches(0.7 + col * 6.2)
    top = Inches(2.7 + row * 0.85)
    textbox(slide, left, top, Inches(0.7), Inches(0.4), num, size=20, bold=True, color=ACCENT)
    textbox(slide, left + Inches(0.85), top, Inches(5), Inches(0.4), label, size=18, color=TEXT)

# 3 Problem
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "Problem",
    "Night messages do not wait for morning staff",
    "Fashion shops on Instagram and Messenger lose sales when nobody is online.",
)
slide = prs.slides[-1]
problems = [
    ("Delayed replies", "Customers ask about size, price, and stock after hours. A slow answer often ends the sale."),
    ("Unreliable answers", "Staff quote outdated prices or invent delivery promises when the catalog is not at hand."),
    ("Handoff chaos", "When a buyer is ready, context is scattered across chats, notes, and memory."),
    ("No operating picture", "Owners cannot see whether AI or humans are closing the loop."),
]
for i, (t, b) in enumerate(problems):
    left = Inches(0.7 + (i % 2) * 6.2)
    top = Inches(2.7 + (i // 2) * 2.0)
    card(slide, left, top, Inches(5.9), Inches(1.75))
    textbox(slide, left + Inches(0.3), top + Inches(0.28), Inches(5.3), Inches(0.4), t, size=18, bold=True, color=TEXT)
    textbox(slide, left + Inches(0.3), top + Inches(0.75), Inches(5.3), Inches(0.8), b, size=14, color=MUTED)

# 4 Solution
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "Solution",
    "A sales workspace that answers from the catalog",
    "AI handles the first reply. Humans confirm the order.",
)
slide = prs.slides[-1]
steps = [
    ("01", "Load the shop", "Catalog, variants, stock, and business rules become the only source of truth."),
    ("02", "Talk like the shop", "Customers write in French, Arabic, or Derja. The AI answers in the same register."),
    ("03", "Stay grounded", "Prices, stock, and delivery come from tools and rules — never from model invention."),
    ("04", "Hand off to buy", "Purchase intent becomes a pending order with a briefing for the human."),
]
for i, (n, t, b) in enumerate(steps):
    left = Inches(0.55 + i * 3.15)
    card(slide, left, Inches(2.75), Inches(3.0), Inches(3.8))
    textbox(slide, left + Inches(0.25), Inches(3.0), Inches(2.5), Inches(0.35), n, size=14, bold=True, color=ACCENT)
    textbox(slide, left + Inches(0.25), Inches(3.45), Inches(2.5), Inches(0.8), t, size=18, bold=True, color=TEXT)
    textbox(slide, left + Inches(0.25), Inches(4.4), Inches(2.5), Inches(1.7), b, size=13, color=MUTED)

# 5 Scope
section_title(prs.slides.add_slide(prs.slide_layouts[6]), "MVP scope", "What ships in phase 1", "Focused on fashion shops that already sell on Meta.")
slide = prs.slides[-1]
ins = [
    "Instagram + Messenger",
    "Website chat widget",
    "Inbox command center",
    "AI playground in Derja",
    "Pending orders + pipeline",
    "Analytics KPIs",
    "Startup operator console",
]
outs = ["WhatsApp (stub only)", "Payments", "Broad vertical templates", "Automatic fine-tuning", "Multi-region deploy"]
card(slide, Inches(0.7), Inches(2.7), Inches(5.9), Inches(4.1))
textbox(slide, Inches(0.95), Inches(2.95), Inches(5.3), Inches(0.4), "In scope", size=16, bold=True, color=ACCENT)
for i, x in enumerate(ins):
    textbox(slide, Inches(0.95), Inches(3.45 + i * 0.42), Inches(5.3), Inches(0.35), "▸  " + x, size=15, color=TEXT)
card(slide, Inches(6.85), Inches(2.7), Inches(5.9), Inches(4.1))
textbox(slide, Inches(7.1), Inches(2.95), Inches(5.3), Inches(0.4), "Out of scope", size=16, bold=True, color=GOLD)
for i, x in enumerate(outs):
    textbox(slide, Inches(7.1), Inches(3.45 + i * 0.5), Inches(5.3), Inches(0.4), "▸  " + x, size=15, color=MUTED)

# 6 Architecture
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "Architecture",
    "Modular monolith, clear boundaries",
    "One deployable system, domains that stay isolated.",
)
slide = prs.slides[-1]
layers = [
    ("Web", "Next.js 16\nInbox, playground,\nwidget, operator"),
    ("API", "NestJS + Fastify\nAuth, AI, orders,\nchannels, billing"),
    ("Data", "Postgres + pgvector\nRedis queues\nObject storage"),
    ("Models", "Groq → Orca →\nVercel AI Gateway\nGrounded tools"),
]
for i, (t, b) in enumerate(layers):
    left = Inches(0.7 + i * 3.15)
    card(slide, left, Inches(2.75), Inches(3.0), Inches(3.7))
    textbox(slide, left + Inches(0.25), Inches(3.05), Inches(2.5), Inches(0.45), t, size=20, bold=True, color=ACCENT)
    textbox(slide, left + Inches(0.25), Inches(3.7), Inches(2.5), Inches(2.4), b, size=15, color=TEXT)

# 7 Product map
section_title(prs.slides.add_slide(prs.slide_layouts[6]), "Product", "Surfaces the team ships", "Every route in the demo video is a real screen.")
slide = prs.slides[-1]
routes = [
    ("/inbox", "Sales command center"),
    ("/playground", "Customer simulator"),
    ("/website", "Embeddable chat bubble"),
    ("/pipeline", "Pending orders board"),
    ("/products", "Catalog and CSV import"),
    ("/analytics", "Four operating KPIs"),
    ("/settings", "Personality, rules, team"),
    ("/operator", "Startup console"),
    ("/onboarding", "Go-live checklist"),
]
for i, (r, d) in enumerate(routes):
    col = i % 3
    row = i // 3
    left = Inches(0.7 + col * 4.15)
    top = Inches(2.7 + row * 1.35)
    card(slide, left, top, Inches(3.95), Inches(1.15))
    textbox(slide, left + Inches(0.25), top + Inches(0.22), Inches(3.4), Inches(0.35), r, size=16, bold=True, color=ACCENT)
    textbox(slide, left + Inches(0.25), top + Inches(0.58), Inches(3.4), Inches(0.35), d, size=14, color=TEXT)

# 8 AI
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "AI behaviour",
    "Derja-first, catalog-bound",
    "The model is allowed to speak. It is not allowed to invent the shop.",
)
slide = prs.slides[-1]
ai_points = [
    ("Language", "French, MSA, Tunisian Arabic, and Arabizi. Demo prompts use Derja such as “slm, andkom pntallon blue”."),
    ("Grounding", "Stock, price, and policy answers come from tools. Golden-set gates block unsafe commercial claims."),
    ("Handoff", "Human-required triggers pause AI and open a briefing so staff continue without re-asking the customer."),
    ("Playground", "Merchants rehearse replies against a sandboxed store before going live."),
]
for i, (t, b) in enumerate(ai_points):
    top = Inches(2.65 + i * 1.05)
    card(slide, Inches(0.7), top, Inches(12.0), Inches(0.95))
    textbox(slide, Inches(0.95), top + Inches(0.18), Inches(2.2), Inches(0.55), t, size=16, bold=True, color=ACCENT)
    textbox(slide, Inches(3.3), top + Inches(0.22), Inches(9.1), Inches(0.6), b, size=15, color=TEXT)

# 9 Testing
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "Testing",
    "Evidence, not ambition",
    "Asma’s dossier: components, endpoints, whole-app as asma@example.com.",
)
slide = prs.slides[-1]
metric_card(slide, Inches(0.7), Inches(2.7), Inches(3.95), Inches(1.7), "API tests", "1,452", "89 suites passed")
metric_card(slide, Inches(4.85), Inches(2.7), Inches(3.95), Inches(1.7), "Shared tests", "39", "5 suites passed")
metric_card(slide, Inches(9.0), Inches(2.7), Inches(3.6), Inches(1.7), "Golden set gates", "Pass", "Price 100% · Stock 98.1%")
card(slide, Inches(0.7), Inches(4.7), Inches(12.0), Inches(2.1))
multiline(
    slide,
    Inches(0.95),
    Inches(4.95),
    Inches(11.5),
    Inches(1.7),
    [
        "Components + endpoint matrix · whole-app Playwright with Asma’s seeded admin account",
        "Jest next to Nest modules · Playwright auth, inbox, admin, core journey, whole-app-asma",
        "Golden set: 104 scenarios · commercial safety 0% · ethics reflection in docs/06-ethics",
    ],
    size=15,
    color=TEXT,
)

# 10 Refactor
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "Refactoring",
    "Measured improvements only",
    "AI suggested changes. Humans kept what tests could prove.",
)
slide = prs.slides[-1]
metric_card(slide, Inches(0.7), Inches(2.7), Inches(3.0), Inches(1.85), "Total complexity", "8750 → 8697", "max stays 65 on purpose")
metric_card(slide, Inches(3.9), Inches(2.7), Inches(3.0), Inches(1.85), "Functions > 20", "43 → 41", "intent + SSRF extracted")
metric_card(slide, Inches(7.1), Inches(2.7), Inches(3.0), Inches(1.85), "Chart payload", "4874 → 194 B", "p95 1.43 → 0.88 ms")
metric_card(slide, Inches(10.3), Inches(2.7), Inches(2.3), Inches(1.85), "Lint errors", "7 → 0", "6 fixed in code")
card(slide, Inches(0.7), Inches(4.8), Inches(12.0), Inches(2.0))
multiline(
    slide,
    Inches(0.95),
    Inches(5.05),
    Inches(11.5),
    Inches(1.6),
    [
        "Accepted: phrase-table intent fallback · predicate-based SSRF ranges · grouped operator chart SQL · safe React lint fixes",
        "Rejected: rewriting order/AI pipelines without characterization tests · next/image on authenticated blob attachments",
        "Full write-up: docs/05-refactoring/report.md",
    ],
    size=14,
    color=TEXT,
)

# 11 Demo
section_title(
    prs.slides.add_slide(prs.slide_layouts[6]),
    "Demo",
    "Watch the full walkthrough",
    "About three and a half minutes. Captions explain every screen.",
)
slide = prs.slides[-1]
card(slide, Inches(0.7), Inches(2.7), Inches(12.0), Inches(3.9))
textbox(slide, Inches(1.0), Inches(3.1), Inches(11.3), Inches(0.5), "docs/demo.mp4", size=28, bold=True, color=ACCENT)
multiline(
    slide,
    Inches(1.0),
    Inches(3.85),
    Inches(11.3),
    Inches(2.4),
    [
        "Playground and website widget tried in Tunisian Derja",
        "Inbox, pipeline, catalog, analytics, every settings tab",
        "Six onboarding steps and the live startup console",
        "Open the file in the repository, or play it from the README link",
    ],
    size=16,
    color=TEXT,
)

# 12 Team
section_title(prs.slides.add_slide(prs.slide_layouts[6]), "Team", "Phase ownership", "Each phase is a pull request owned by one member.")
slide = prs.slides[-1]
team = [
    ("Rayen", "Requirements, methodology, design", "docs/01 · 02 · 03"),
    ("Aymen", "Frontend and ethics", "apps/web · docs/06"),
    ("Moataz", "Backend, optimization, refactoring", "apps/api · docs/05"),
    ("Asma", "Testing of the whole application", "tests · docs/04"),
]
for i, (n, r, f) in enumerate(team):
    left = Inches(0.7 + i * 3.15)
    card(slide, left, Inches(2.75), Inches(3.0), Inches(3.7))
    textbox(slide, left + Inches(0.25), Inches(3.05), Inches(2.5), Inches(0.45), n, size=22, bold=True, color=TEXT)
    textbox(slide, left + Inches(0.25), Inches(3.7), Inches(2.5), Inches(1.4), r, size=14, color=MUTED)
    textbox(slide, left + Inches(0.25), Inches(5.4), Inches(2.5), Inches(0.6), f, size=13, bold=True, color=ACCENT)

# 13 Run locally
section_title(prs.slides.add_slide(prs.slide_layouts[6]), "Run it", "Same path as the working demo", "Node 22+, pnpm, Docker.")
slide = prs.slides[-1]
card(slide, Inches(0.7), Inches(2.7), Inches(7.4), Inches(4.1))
multiline(
    slide,
    Inches(1.0),
    Inches(3.0),
    Inches(6.9),
    Inches(3.6),
    [
        "pnpm install",
        "cp .env.example apps/api/.env and apps/web/.env",
        "docker compose up -d postgres redis",
        "pnpm db:generate && pnpm db:push && pnpm db:seed",
        "pnpm dev:api   # :4000",
        "pnpm dev:web   # :3000",
    ],
    size=16,
    color=TEXT,
)
card(slide, Inches(8.35), Inches(2.7), Inches(4.3), Inches(4.1))
textbox(slide, Inches(8.6), Inches(3.0), Inches(3.8), Inches(0.4), "Demo login", size=16, bold=True, color=ACCENT)
multiline(
    slide,
    Inches(8.6),
    Inches(3.55),
    Inches(3.8),
    Inches(2.8),
    [
        "demo@example.com",
        "admin@example.com",
        "asma@example.com  (testing)",
        "agent@example.com",
        "operator@example.com",
        "Password123!",
    ],
    size=14,
    color=TEXT,
)

# 14 Closing
slide = prs.slides.add_slide(prs.slide_layouts[6])
add_bg(slide)
panel = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.18), prs.slide_height)
panel.line.fill.background()
panel.fill.solid()
panel.fill.fore_color.rgb = ACCENT
textbox(slide, Inches(0.9), Inches(2.2), Inches(11.5), Inches(1.0), "Questions", size=54, bold=True, color=TEXT)
textbox(
    slide,
    Inches(0.9),
    Inches(3.5),
    Inches(11),
    Inches(0.8),
    "AI Sales Manager — grounded replies for Tunisian shops,\nwith a human still holding the confirmation.",
    size=18,
    color=MUTED,
)
textbox(slide, Inches(0.9), Inches(5.5), Inches(11), Inches(0.4), "github.com/R2W1cs/ai_sales_manager", size=14, color=ACCENT)
textbox(
    slide,
    Inches(0.9),
    Inches(6.0),
    Inches(11),
    Inches(0.35),
    "Presentation · docs/demo.mp4 · docs/04-testing · docs/05-refactoring · docs/06-ethics",
    size=13,
    color=MUTED,
)

out = r"C:\Users\rayen\Downloads\ai-sales-manager-r2w\presentation\AI-Sales-Manager.pptx"
prs.save(out)
print("saved", out)
