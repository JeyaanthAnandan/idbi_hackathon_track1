#!/usr/bin/env python3
"""
Generates docs/MITRA_Data_Field_Requirements.docx

Follows the column format of the IDBI Innovate 2026 sample:
  API Request  : Field Name | Field Type | Max Field Length | Mandatory/Optional | Sample Values | Description
  API Response : Field Name | Field Type | Max Field Length | Sample Values | Description
"""
from docx import Document
from docx.shared import Pt, Inches, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TEAL = RGBColor(0x00, 0x6B, 0x6B)
TEAL_HEX = "006B6B"
ORANGE_HEX = "E86F1E"
GREY_HEX = "F2F4F4"
INK = RGBColor(0x1A, 0x1A, 0x1A)
SOFT = RGBColor(0x5A, 0x63, 0x63)

doc = Document()

# ── page setup: landscape, narrow margins (field tables are wide) ──
sec = doc.sections[0]
sec.orientation = WD_ORIENT.LANDSCAPE
sec.page_width, sec.page_height = sec.page_height, sec.page_width
sec.left_margin = sec.right_margin = Inches(0.6)
sec.top_margin = Inches(0.65)
sec.bottom_margin = Inches(0.6)
USABLE = sec.page_width - sec.left_margin - sec.right_margin
USABLE_IN = Emu(USABLE).inches
TARGET_IN = USABLE_IN - 0.05  # hairline safety margin


def fit(widths_in):
    """Scale a list of column widths (inches) to exactly fit the usable page width."""
    total = sum(widths_in)
    return [Inches(w * TARGET_IN / total) for w in widths_in]

# ── base styles ──
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10)
normal.font.color.rgb = INK
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.15
rpr = normal.element.get_or_add_rPr().get_or_add_rFonts()
rpr.set(qn("w:eastAsia"), "Calibri")


def shade(cell, hex_color):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:color"), "auto")
    el.set(qn("w:fill"), hex_color)
    tcPr.append(el)


def set_repeat_header(row):
    trPr = row._tr.get_or_add_trPr()
    el = OxmlElement("w:tblHeader")
    el.set(qn("w:val"), "true")
    trPr.append(el)


def cell_text(cell, text, size=8.5, bold=False, color=INK, italic=False):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run(str(text))
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    run.font.name = "Calibri"


def mono(cell, text, size=8.5, bold=False):
    cell.text = ""
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.line_spacing = 1.0
    run = p.add_run(str(text))
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = "Consolas"
    run.font.color.rgb = INK


def h1(text, num=None):
    doc.add_page_break()
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(f"{num}  {text}" if num else text)
    r.font.size = Pt(17)
    r.font.bold = True
    r.font.color.rgb = TEAL
    bar = doc.add_paragraph()
    bar.paragraph_format.space_after = Pt(10)
    br = bar.add_run("─" * 60)
    br.font.size = Pt(6)
    br.font.color.rgb = TEAL


def h2(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(text)
    r.font.size = Pt(12.5)
    r.font.bold = True
    r.font.color.rgb = TEAL
    return p


def h3(text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(9)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text)
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = INK
    return p


def para(text, size=10, color=INK, italic=False, bold=False, space=6):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space)
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.color.rgb = color
    r.font.italic = italic
    r.font.bold = bold
    return p


def bullet(text, size=10):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.left_indent = Inches(0.28)
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.font.color.rgb = INK
    return p


def note(text):
    """Callout box."""
    t = doc.add_table(rows=1, cols=1)
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    c = t.rows[0].cells[0]
    shade(c, "FFF6E8")
    cell_text(c, text, size=9)
    w = Inches(TARGET_IN)
    c.width = w
    t.columns[0].width = w
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return t


# widths for the 6-col request table and 5-col response table
REQ_W = fit([2.10, 0.78, 0.86, 1.08, 1.70, 3.28])
RES_W = fit([2.20, 0.78, 0.86, 1.78, 4.13])
REQ_HDR = ["Field Name", "Field Type", "Max Field Length", "Mandatory/Optional", "Sample Values", "Description"]
RES_HDR = ["Field Name", "Field Type", "Max Field Length", "Sample Values", "Description"]


def field_table(headers, widths, rows):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.LEFT
    t.autofit = False
    hdr = t.rows[0]
    set_repeat_header(hdr)
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        shade(c, TEAL_HEX)
        cell_text(c, h, size=8.5, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        c.width = widths[i]
    for r_i, row in enumerate(rows):
        cells = t.add_row().cells
        for i, val in enumerate(row):
            c = cells[i]
            if r_i % 2 == 1:
                shade(c, GREY_HEX)
            if i == 0:
                mono(c, val)
            else:
                cell_text(c, val)
            c.width = widths[i]
    for i, w in enumerate(widths):
        for cell in t.columns[i].cells:
            cell.width = w
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def simple_table(headers, widths, rows, mono_col=0):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Table Grid"
    t.autofit = False
    hdr = t.rows[0]
    set_repeat_header(hdr)
    for i, h in enumerate(headers):
        c = hdr.cells[i]
        shade(c, TEAL_HEX)
        cell_text(c, h, size=8.5, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
        c.width = widths[i]
    for r_i, row in enumerate(rows):
        cells = t.add_row().cells
        for i, val in enumerate(row):
            c = cells[i]
            if r_i % 2 == 1:
                shade(c, GREY_HEX)
            if i == mono_col and mono_col >= 0:
                mono(c, val, size=8.5)
            else:
                cell_text(c, val, size=9)
            c.width = widths[i]
    for i, w in enumerate(widths):
        for cell in t.columns[i].cells:
            cell.width = w
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


# ════════════════════════════════════════════════════════════
# COVER
# ════════════════════════════════════════════════════════════
for _ in range(2):
    doc.add_paragraph()

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("IDBI Innovate 2026")
r.font.size = Pt(13)
r.font.bold = True
r.font.color.rgb = RGBColor(0xE8, 0x6F, 0x1E)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(2)
r = p.add_run("MITRA")
r.font.size = Pt(40)
r.font.bold = True
r.font.color.rgb = TEAL

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("Avatar-based AI Digital Wealth Advisor")
r.font.size = Pt(13)
r.font.color.rgb = SOFT

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(26)
r = p.add_run("Data Field Requirements")
r.font.size = Pt(22)
r.font.bold = True
r.font.color.rgb = INK

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_after = Pt(30)
r = p.add_run("API request and response field specification for sandbox integration")
r.font.size = Pt(10.5)
r.font.color.rgb = SOFT

ctrl = doc.add_table(rows=0, cols=2)
ctrl.style = "Table Grid"
ctrl.alignment = WD_TABLE_ALIGNMENT.CENTER
for k, v in [
    ("Document", "MITRA — Data Field Requirements"),
    ("Track", "Track 1 — AI Digital Wealth Advisor"),
    ("Version", "1.0 (Draft for review)"),
    ("Date", "24 August 2026"),
    ("Prepared by", "MITRA Team"),
    ("Status", "For IDBI review — field list not yet frozen"),
    ("Companion artifacts", "openapi.yaml (machine-readable) · API_CONTRACT.md · SANDBOX_REQUIREMENTS.md"),
]:
    cells = ctrl.add_row().cells
    shade(cells[0], GREY_HEX)
    cell_text(cells[0], k, size=9.5, bold=True)
    cell_text(cells[1], v, size=9.5)
    cells[0].width = Inches(2.0)
    cells[1].width = Inches(6.2)
for cell in ctrl.columns[0].cells:
    cell.width = Inches(2.0)
for cell in ctrl.columns[1].cells:
    cell.width = Inches(6.2)

# ════════════════════════════════════════════════════════════
h1("Purpose and Scope", "1")

para(
    "This document specifies the data fields MITRA requires from IDBI Bank source systems, and the "
    "fields MITRA returns, using the column format of the IDBI Innovate 2026 Data Field Requirements "
    "sample. It is the integration contract between MITRA and the bank's data platform."
)

h2("1.1  What MITRA does with this data")
para(
    "MITRA is a conversational wealth advisor embedded in the IDBI mobile app. It reads a customer's "
    "accounts, holdings, transactions, liabilities and protection cover, computes a financial health "
    "picture, and delivers proactive guidance — surplus detection, goal planning, tax-limit "
    "utilisation, allocation drift, protection gaps and scam detection. Every number it presents is "
    "computed from the fields in this document; none are hard-coded."
)

h2("1.2  Scope of this specification")
rows = [
    ["In scope", "Customer profile, deposit accounts, investment holdings, transactions, liabilities, insurance, tax utilisation, and all derived advisory outputs."],
    ["Out of scope", "Transaction execution (SIP mandates, fund transfers), KYC onboarding, and card issuance. MITRA is read-only in the sandbox phase."],
    ["Direction", "Sections 4–11 are inbound (bank → MITRA). Section 12 is outbound (MITRA → bank/app), covering advisory output that must be logged for audit."],
    ["Environment", "Sandbox. All fields specified against synthetic or Account Aggregator sandbox data; no production customer data."],
]
simple_table(["Aspect", "Definition"], fit([1.6, 8.4]), rows, mono_col=-1)

h2("1.3  How to read this document")
bullet("Each API has a Request table (fields MITRA sends) and a Response table (fields the bank returns).")
bullet('Fields marked "Engineered" in the Description are derived by MITRA or the source platform, not stored raw — the same convention used in the IDBI sample.')
bullet('Fields marked "Preferred" are not mandatory for a first sandbox cut, but materially improve advice quality. Section 3.5 lists the minimum viable set.')
bullet("Response tables that describe repeating data (accounts, holdings, transactions) represent one record in an array.")

# ════════════════════════════════════════════════════════════
h1("Data Sources and Consent Basis", "2")

para(
    "MITRA consumes data from four channels. The consent basis differs by channel and determines "
    "retention, so it is stated per source rather than globally."
)

rows = [
    ["Core Banking System", "Profile, deposit accounts, balances, liabilities, IDBI-held investments", "Existing customer relationship + in-app terms", "Internal API / event stream"],
    ["Account Aggregator", "External bank accounts, mutual funds, equities, NPS, insurance policies", "RBI AA consent artefact (ReBIT 2.0), customer-revocable", "AA — FI data request"],
    ["Statement upload", "Transactions and holdings from a customer-supplied PDF/CSV export", "Explicit per-upload consent", "Customer-initiated upload"],
    ["Reference data", "NAVs, index levels, expense ratios, product master", "Licensed vendor feed / AMFI public file", "Scheduled batch"],
]
simple_table(
    ["Source", "Data provided", "Consent basis", "Mechanism"],
    fit([1.85, 3.5, 2.6, 2.05]),
    rows, mono_col=-1,
)

note(
    "Purpose limitation: data obtained under a wealth-advisory consent purpose cannot be reused for "
    "credit assessment, collections or marketing without a fresh consent. MITRA scopes access per "
    "purpose at the IAM layer rather than relying on policy documentation alone."
)

h2("2.1  Retention and revocation")
bullet("Raw uploaded statement files are deleted 90 days after ingestion; only derived transactions persist.")
bullet("On consent revocation, all data derived from that consent is purged within 24 hours and the purge is recorded in the consent log.")
bullet("Advisory outputs (Section 12) are retained for 8 years under SEBI record-keeping norms, independent of the source-data consent lifecycle.")

# ════════════════════════════════════════════════════════════
h1("Field Conventions", "3")

h2("3.1  Data types")
rows = [
    ["String", "Text. Max Field Length is character count.", "SALARIED_PROFESSIONAL"],
    ["Integer", "Whole number. Max Field Length is digit count.", "148"],
    ["Decimal", "Fixed-point. Max Field Length is precision,scale — 18,2 means up to 18 digits with 2 decimal places.", "8450000.00"],
    ["Date", "DD-MM-YY, consistent with the IDBI sample.", "24-08-26"],
    ["Datetime", "ISO-8601 UTC, used where ordering within a day matters.", "2026-08-24T09:15:00Z"],
    ["Boolean", "true / false.", "true"],
    ["Enum", "String constrained to a listed value set. Permitted values are given in the Description.", "DEBIT"],
]
simple_table(["Type", "Definition", "Sample"], fit([1.15, 6.4, 2.45]), rows, mono_col=0)

note(
    "Deviation from the sample, stated deliberately: the IDBI sample labels monetary fields as "
    '"Integer" with a 18,2 length. This document uses "Decimal" for those fields, since 18,2 denotes '
    "precision and scale rather than a whole number. The lengths are unchanged and remain compatible "
    "with the sample. Amounts are expressed in rupees; MITRA's internal REST API transports integer "
    "paise and converts at the boundary to avoid floating-point drift in compounding calculations."
)

h2("3.2  Naming and nulls")
bullet("Field names are lower snake_case, matching the IDBI sample convention.")
bullet("A field that is genuinely unknown must be returned as null, never as 0. A zero balance and an unknown balance lead to different advice.")
bullet("Masked fields carry the _masked suffix and must be masked at source, not by MITRA.")

h2("3.3  Amounts and currency")
bullet("All amounts are INR unless a currency_code field is present on the same record.")
bullet("Negative values are permitted only where the Description states so (growth percentages, surplus, unrealised gain).")

h2("3.4  Engineered fields")
para(
    'Following the IDBI sample, a field described as "Engineered" is calculated rather than stored. '
    "For every engineered field this document names its inputs so the derivation is reproducible and "
    "auditable. Where the calculation depends on an assumption — an expected rate of return, an "
    "emergency-fund target, a tax slab — that assumption is a versioned policy parameter returned "
    "alongside the result (Section 12.3), not a constant embedded in code."
)

h2("3.5  Minimum viable field set")
para(
    "If a full-scope feed is not available for the first sandbox cut, the following subset is "
    "sufficient for MITRA to produce meaningful advice. Everything else degrades a feature rather "
    "than blocking the build."
)
rows = [
    ["Section 4 — Profile", "customer_id, age, customer_segment, monthly_income_declared, dependent_count", "Without age and income, risk profiling and protection-gap advice cannot run."],
    ["Section 5 — Accounts", "account_id, account_type, current_balance", "Drives emergency-fund cover, the single highest-impact insight."],
    ["Section 6 — Holdings", "instrument_name, asset_class, current_value, invested_value", "Drives allocation, drift and gain calculations."],
    ["Section 7 — Transactions", "transaction_date, narration, amount, transaction_type", "MITRA categorises these itself if category_code is absent."],
    ["Section 8 — Liabilities", "outstanding_amount, interest_rate_pct, emi_amount", "Needed for prepay-versus-invest guidance."],
]
simple_table(["Section", "Minimum fields", "Consequence if absent"], fit([1.85, 4.3, 3.85]), rows, mono_col=-1)

# ════════════════════════════════════════════════════════════
# 4. CUSTOMER PROFILE
# ════════════════════════════════════════════════════════════
h1("Customer Profile API", "4")
para("Returns the customer's identity, segment and current risk profile. Called once per session.", color=SOFT, size=9.5)

h3("4.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier (CIF number)."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference under which this call is made. Logged against every response."],
    ["as_on_date", "Date", "10", "Optional", "24-08-26", "Position date. Defaults to current date when omitted."],
])

h3("4.2  API Response")
field_table(RES_HDR, RES_W, [
    ["customer_id", "String", "20", "CUST-88214", "Unique customer identifier."],
    ["customer_name", "String", "150", "Priya Sharma", "Full registered name."],
    ["masked_name", "String", "150", "P**** S*****", "Masked form for display in shared or screenshot contexts."],
    ["date_of_birth", "Date", "10", "14-03-97", "Required for age-based asset allocation and insurance premium estimation."],
    ["age", "Integer", "3", "29", "Engineered from date_of_birth. Supplied directly if DOB cannot be shared."],
    ["gender", "String", "10", "F", "Optional. Used only for insurance premium estimation, never for advice differentiation."],
    ["pan_masked", "String", "10", "ABCDE****F", "Masked PAN. Confirms tax-reporting linkage; full PAN is not required."],
    ["mobile_masked", "String", "13", "+91-98****4412", "Masked mobile for notification routing."],
    ["email_masked", "String", "100", "p****@mail.com", "Masked email."],
    ["customer_segment", "String", "30", "SALARIED_PROFESSIONAL", "One of SALARIED_PROFESSIONAL, SELF_EMPLOYED, RETIRED, STUDENT, HOMEMAKER, OTHER. Drives income-volatility expectations."],
    ["city", "String", "50", "Mumbai", "Communication city. Determines metro versus non-metro health-cover benchmark."],
    ["state_code", "String", "2", "27", "State code, consistent with the GSTN state-code convention."],
    ["relationship_since", "Date", "10", "01-06-19", "Relationship start date, used for tenure-based messaging."],
    ["kyc_status", "String", "20", "VERIFIED", "VERIFIED, PENDING or EXPIRED. MITRA suppresses all product guidance when not VERIFIED."],
    ["kyc_risk_category", "String", "10", "LOW", "LOW, MEDIUM or HIGH, per the bank's existing KYC risk rating."],
    ["pan_linked", "Boolean", "1", "true", "Whether PAN is linked. Gates 80C and capital-gains guidance."],
    ["preferred_language", "String", "5", "hi", "ISO 639-1. One of en, hi, ta, te, bn, mr, gu, kn, ml."],
    ["monthly_income_declared", "Decimal", "18,2", "95000.00", "Declared monthly income. Where absent, MITRA infers it from salary credits (Section 9)."],
    ["income_verification_source", "String", "20", "SALARY_CREDIT", "DECLARED, SALARY_CREDIT, ITR or PAYSLIP. Determines how much weight advice places on the figure."],
    ["dependent_count", "Integer", "2", "2", "Number of financial dependents. Directly drives the recommended term-cover multiple."],
    ["employment_type", "String", "20", "PERMANENT", "Preferred. PERMANENT, CONTRACT, SELF_EMPLOYED or GIG. Affects income-stability scoring."],
    ["risk_profile_band", "String", "15", "BALANCED", "CONSERVATIVE, BALANCED or AGGRESSIVE. Null if never assessed — MITRA then triggers the questionnaire."],
    ["risk_profile_score", "Integer", "2", "8", "Raw questionnaire score backing the band."],
    ["risk_profile_source", "String", "20", "QUESTIONNAIRE", "QUESTIONNAIRE, DERIVED or ADVISOR_OVERRIDE. Required for suitability audit."],
    ["risk_profile_assessed_date", "Date", "10", "01-08-26", "Date of assessment."],
    ["risk_profile_valid_until", "Date", "10", "01-08-27", "Expiry. MITRA forces re-assessment past this date rather than advising on a stale profile."],
])

# ════════════════════════════════════════════════════════════
h1("Accounts and Balances API", "5")
para("Deposit and cash accounts. One response record per account.", color=SOFT, size=9.5)

h3("5.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference."],
    ["account_type", "String", "20", "Optional", "SAVINGS", "Filter. Returns all account types when omitted."],
    ["include_closed", "Boolean", "1", "Optional", "false", "Whether to include closed accounts. Defaults to false."],
])

h3("5.2  API Response (repeating block, one per account)")
field_table(RES_HDR, RES_W, [
    ["account_id", "String", "30", "ACC_01J8X2P4", "Unique account identifier, stable across calls."],
    ["account_type", "String", "20", "SAVINGS", "SAVINGS, CURRENT, FD, RD, PPF, NPS or DEMAT."],
    ["institution_name", "String", "100", "IDBI Bank", "Holding institution. Non-IDBI values arrive via Account Aggregator."],
    ["account_number_masked", "String", "20", "****4412", "Masked account number. Full number is never required."],
    ["ifsc", "String", "11", "IBKL0000123", "Branch identifier."],
    ["current_balance", "Decimal", "18,2", "264500.00", "Ledger balance as at last_synced_datetime."],
    ["available_balance", "Decimal", "18,2", "264500.00", "Balance net of holds. Used for emergency-cover calculation in preference to current_balance."],
    ["currency_code", "String", "3", "INR", "ISO 4217."],
    ["account_opened_date", "Date", "10", "12-06-19", "Account opening date."],
    ["maturity_date", "Date", "10", "12-06-27", "Applicable to FD and RD only. Drives liquidity classification and reinvestment reminders."],
    ["interest_rate_pct", "Decimal", "5,2", "7.10", "Contracted rate. Used for the deposit-versus-market opportunity-cost comparison."],
    ["auto_renew_flag", "Boolean", "1", "true", "Applicable to FD only."],
    ["account_status", "String", "15", "ACTIVE", "ACTIVE, DORMANT, FROZEN or CLOSED. Dormant and frozen accounts are excluded from surplus calculations."],
    ["linked_via", "String", "25", "CORE_BANKING", "CORE_BANKING, ACCOUNT_AGGREGATOR, STATEMENT_UPLOAD or MANUAL. Determines the trust weight applied to the record."],
    ["last_synced_datetime", "Datetime", "20", "2026-08-23T18:00:00Z", "Last successful refresh. MITRA visibly degrades its confidence when this exceeds 7 days."],
])

# ════════════════════════════════════════════════════════════
h1("Portfolio Holdings API", "6")
para("Investment holdings across mutual funds, equities, gold and retirement products. One record per holding.", color=SOFT, size=9.5)

h3("6.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference."],
    ["asset_class", "String", "20", "Optional", "EQUITY_MF", "Filter. Returns all asset classes when omitted."],
    ["valuation_date", "Date", "10", "Optional", "23-08-26", "Valuation date. Defaults to the latest available NAV date."],
])

h3("6.2  API Response (repeating block, one per holding)")
field_table(RES_HDR, RES_W, [
    ["holding_id", "String", "30", "HLD_01J8X2P4", "Unique holding identifier, stable across calls."],
    ["asset_class", "String", "20", "EQUITY_MF", "EQUITY_MF, DEBT_MF, HYBRID_MF, EQUITY_DIRECT, FD, GOLD, NPS, PPF, EPF, REAL_ESTATE or OTHER. Drives the allocation and drift calculation."],
    ["instrument_type", "String", "30", "MUTUAL_FUND", "MUTUAL_FUND, EQUITY, BOND, SGB, ETF or DEPOSIT."],
    ["instrument_name", "String", "150", "Nifty 50 Index Fund", "Scheme or security name as displayed to the customer."],
    ["isin", "String", "12", "INF209KB1TN0", "Preferred. Enables NAV, expense-ratio and portfolio-overlap lookup against reference data."],
    ["scheme_code", "String", "20", "119551", "AMFI scheme code, where ISIN is unavailable."],
    ["folio_number_masked", "String", "20", "****8821", "Masked folio number."],
    ["units_held", "Decimal", "15,3", "412.338", "Unit balance."],
    ["nav", "Decimal", "12,4", "209.5400", "Net asset value per unit."],
    ["nav_date", "Date", "10", "23-08-26", "NAV date. A NAV older than 3 business days is flagged stale."],
    ["current_value", "Decimal", "18,2", "86400.00", "Market value. Engineered as units_held × nav where not supplied."],
    ["invested_value", "Decimal", "18,2", "58000.00", "Total cost of acquisition. Required for gain and LTCG-harvest calculations."],
    ["unrealised_gain", "Decimal", "18,2", "28400.00", "Engineered as current_value − invested_value. May be negative."],
    ["xirr_pct", "Decimal", "7,2", "12.40", "Engineered annualised return from the cashflow history. Replaces a simple growth percentage, which misstates return for SIP holdings."],
    ["plan_type", "String", "10", "DIRECT", "DIRECT or REGULAR. Drives the fee-drag insight — the single largest recoverable cost MITRA identifies."],
    ["expense_ratio_pct", "Decimal", "5,2", "0.20", "Current total expense ratio."],
    ["direct_expense_ratio_pct", "Decimal", "5,2", "0.20", "Expense ratio of the corresponding direct plan. Enables the switch-saving calculation."],
    ["sip_active", "Boolean", "1", "true", "Whether a systematic instruction is running."],
    ["sip_amount", "Decimal", "18,2", "5000.00", "Monthly instalment where sip_active is true."],
    ["sip_start_date", "Date", "10", "05-01-24", "SIP commencement date. Used for the consistency component of the behavioural profile."],
    ["lock_in_end_date", "Date", "10", "05-01-27", "Applicable to ELSS, NPS and tax-saver deposits. Prevents MITRA recommending a locked holding as liquid."],
    ["liquid_flag", "Boolean", "1", "true", "Whether the holding is redeemable within 3 working days."],
    ["exit_load_pct", "Decimal", "5,2", "1.00", "Applicable exit load. Netted from any switch or redemption recommendation."],
    ["acquisition_date", "Date", "10", "05-01-24", "Earliest acquisition date. Determines long-term versus short-term capital-gains treatment."],
    ["riskometer", "String", "20", "VERY_HIGH", "SEBI riskometer band. Required for suitability checking against the customer's risk profile."],
    ["data_source", "String", "30", "AA_CAMS", "Origin of the record: CORE_BANKING, AA_CAMS, AA_KFIN, STATEMENT_UPLOAD or MANUAL."],
])

# ════════════════════════════════════════════════════════════
h1("Transactions API", "7")
para(
    "Transaction history. MITRA requires a minimum of 6 months and prefers 24 months; below 3 months "
    "the spending-anomaly and recurring-payment detection are suppressed rather than shown at low "
    "confidence.", color=SOFT, size=9.5,
)

h3("7.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference."],
    ["account_id", "String", "30", "Optional", "ACC_01J8X2P4", "Filter to one account. Returns all consented accounts when omitted."],
    ["from_date", "Date", "10", "Mandatory", "01-08-25", "Start of the requested window."],
    ["to_date", "Date", "10", "Mandatory", "24-08-26", "End of the requested window."],
    ["page_size", "Integer", "4", "Optional", "500", "Records per page. Maximum 1000, default 500."],
    ["cursor", "String", "200", "Optional", "eyJrIjoiMjAyNi0w", "Opaque continuation token. Cursor pagination is required — offset pagination is unstable at transaction volumes."],
])

h3("7.2  API Response (repeating block, one per transaction)")
field_table(RES_HDR, RES_W, [
    ["transaction_id", "String", "40", "TXN_01J8X2P4K9", "Unique, stable transaction identifier. Required for idempotent re-ingestion."],
    ["account_id", "String", "30", "ACC_01J8X2P4", "Owning account."],
    ["transaction_date", "Date", "10", "02-06-26", "Transaction date."],
    ["value_date", "Date", "10", "02-06-26", "Value date, where it differs from transaction date."],
    ["narration", "String", "200", "UPI/SWIGGY/9821443", "Raw bank narration. MITRA's categoriser operates on this field."],
    ["normalised_merchant", "String", "100", "Swiggy", "Engineered. Merchant extracted from the narration. Supplied by MITRA where the source cannot."],
    ["amount", "Decimal", "18,2", "650.00", "Absolute transaction amount. Direction is carried in transaction_type, not in the sign."],
    ["transaction_type", "String", "6", "DEBIT", "DEBIT or CREDIT."],
    ["transaction_mode", "String", "20", "UPI", "UPI, NEFT, IMPS, RTGS, CARD, ATM, CASH, CHEQUE, ACH or INTERNAL. UPI counts drive the round-up feature."],
    ["balance_after", "Decimal", "18,2", "263850.00", "Running balance after posting. Enables balance reconstruction where a statement window is incomplete."],
    ["category_code", "String", "30", "DINING_DELIVERY", "Engineered. See Section 7.3 for the permitted value set. MITRA derives this where not supplied."],
    ["category_confidence", "Decimal", "3,2", "0.94", "Engineered. 0.00–1.00. Rows below 0.60 are surfaced to the customer for confirmation rather than used silently."],
    ["category_source", "String", "10", "RULE", "RULE, MODEL or CUSTOMER. A customer correction always supersedes and is retained as a training signal."],
    ["essential_flag", "Boolean", "1", "false", "Engineered. Whether the category is discretionary. Only non-essential categories are proposed for trimming."],
    ["recurring_flag", "Boolean", "1", "false", "Engineered. Set where the merchant recurs at a consistent amount across two or more distinct months."],
    ["counterparty_name", "String", "100", "Swiggy Ltd", "Counterparty, where available from the payment rail."],
    ["reference_number", "String", "40", "UPI2026060298214", "Payment reference, for dispute traceability."],
])

h3("7.3  Permitted values — category_code")
para(
    "Rows that match no rule are returned as OTHER with a confidence below 0.60 and routed to the "
    "customer-review queue.", size=9.5, color=SOFT,
)
rows = [
    ["RENT_UTILITIES", "Yes", "Rent, electricity, water, gas, broadband, society maintenance"],
    ["GROCERIES", "Yes", "Supermarkets, quick-commerce, kirana"],
    ["DINING_DELIVERY", "No", "Restaurants, food delivery aggregators, cafes"],
    ["SHOPPING", "No", "E-commerce, apparel, electronics, general retail"],
    ["TRANSPORT_FUEL", "Yes", "Ride-hailing, fuel, metro, rail, tolls"],
    ["SUBSCRIPTIONS", "No", "Streaming, software, membership services"],
    ["HEALTH_FITNESS", "Yes", "Pharmacy, hospital, clinic, diagnostics, gym"],
    ["ENTERTAINMENT", "No", "Cinema, events, gaming"],
    ["EDUCATION", "Yes", "School and college fees, courses, coaching"],
    ["INSURANCE_PREMIUM", "Yes", "Life, health and motor premium debits"],
    ["EMI_LOAN", "Yes", "Loan instalments and credit-card repayments"],
    ["INVESTMENTS", "No", "SIP debits, broker transfers, deposit creation. Excluded from spend and counted as invested."],
    ["TRANSFERS", "No", "Self-transfers and person-to-person transfers. Excluded from spend to avoid double-counting."],
    ["CASH_WITHDRAWAL", "No", "ATM and cash withdrawals. Cannot be categorised further and is reported separately."],
    ["BUSINESS_EXPENSE", "Yes", "Inventory, supplies and business services — relevant to self-employed customers"],
    ["FAMILY_SOCIAL", "No", "Gifts, family support, social and festival obligations"],
    ["OTHER", "No", "Uncategorised. A high OTHER share is reported as a data-quality signal, not hidden."],
]
simple_table(["category_code", "Essential", "Covers"], fit([2.25, 1.0, 6.75]), rows, mono_col=0)

# ════════════════════════════════════════════════════════════
h1("Liabilities API", "8")
para("Loans and credit facilities. One record per liability.", color=SOFT, size=9.5)

h3("8.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference."],
    ["include_closed", "Boolean", "1", "Optional", "false", "Whether to include settled liabilities. Defaults to false."],
])

h3("8.2  API Response (repeating block, one per liability)")
field_table(RES_HDR, RES_W, [
    ["liability_id", "String", "30", "LIA_01J8X2P4", "Unique liability identifier."],
    ["liability_type", "String", "25", "EDUCATION_LOAN", "HOME_LOAN, EDUCATION_LOAN, PERSONAL_LOAN, VEHICLE_LOAN, BUSINESS_LOAN, GOLD_LOAN or CREDIT_CARD."],
    ["lender_name", "String", "100", "IDBI Bank", "Lending institution."],
    ["account_number_masked", "String", "20", "****9921", "Masked loan account number."],
    ["sanctioned_amount", "Decimal", "18,2", "400000.00", "Original sanctioned amount."],
    ["outstanding_amount", "Decimal", "18,2", "180000.00", "Current principal outstanding."],
    ["interest_rate_pct", "Decimal", "5,2", "10.50", "Current annual rate. Compared against expected portfolio return in the prepay-versus-invest calculation."],
    ["rate_type", "String", "10", "FLOATING", "FIXED or FLOATING. A floating rate widens the projection band accordingly."],
    ["emi_amount", "Decimal", "18,2", "8352.00", "Contracted monthly instalment."],
    ["emi_due_day", "Integer", "2", "5", "Day of month the instalment is debited. Used for cashflow timing advice."],
    ["tenure_months_total", "Integer", "3", "60", "Original tenure in months."],
    ["tenure_months_remaining", "Integer", "3", "24", "Remaining tenure in months."],
    ["next_due_date", "Date", "10", "05-09-26", "Next instalment date."],
    ["overdue_amount", "Decimal", "18,2", "0.00", "Amount currently overdue. Any non-zero value suppresses all investment advice in favour of arrears guidance."],
    ["dpd_count_12m", "Integer", "3", "0", "Engineered. Count of days-past-due events in the trailing 12 months."],
    ["foreclosure_charges_pct", "Decimal", "5,2", "0.00", "Prepayment penalty. Netted from any prepayment recommendation — omitting it overstates the benefit."],
    ["prepayment_allowed_flag", "Boolean", "1", "true", "Whether part-prepayment is contractually permitted."],
    ["tax_benefit_section", "String", "10", "80E", "Applicable deduction section, where any. Education-loan interest under 80E materially changes the prepay recommendation."],
])

# ════════════════════════════════════════════════════════════
h1("Insurance and Protection API", "9")
para("In-force policies. Drives the protection-gap analysis.", color=SOFT, size=9.5)

h3("9.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference."],
])

h3("9.2  API Response (repeating block, one per policy)")
field_table(RES_HDR, RES_W, [
    ["policy_id", "String", "30", "POL_01J8X2P4", "Unique policy identifier."],
    ["policy_type", "String", "25", "TERM_LIFE", "TERM_LIFE, ENDOWMENT, ULIP, HEALTH, CRITICAL_ILLNESS, PERSONAL_ACCIDENT or MOTOR."],
    ["insurer_name", "String", "100", "Star Health", "Insurer."],
    ["policy_number_masked", "String", "30", "****7741", "Masked policy number."],
    ["sum_assured", "Decimal", "18,2", "2000000.00", "Cover amount. Compared against the income-multiple benchmark to size the protection gap."],
    ["annual_premium", "Decimal", "18,2", "12000.00", "Annual premium. Counted as a committed outflow in the surplus calculation."],
    ["premium_frequency", "String", "15", "ANNUAL", "MONTHLY, QUARTERLY, HALF_YEARLY or ANNUAL."],
    ["policy_start_date", "Date", "10", "01-04-22", "Commencement date."],
    ["policy_end_date", "Date", "10", "31-03-27", "Expiry or maturity date. Drives renewal reminders."],
    ["next_premium_due_date", "Date", "10", "01-04-27", "Next premium date."],
    ["portable_flag", "Boolean", "1", "false", "Whether cover survives a change of employer. Employer group cover that lapses on exit is the most commonly overlooked protection gap and must be distinguishable."],
    ["nominee_registered_flag", "Boolean", "1", "true", "Whether a nominee is on record. An unregistered nominee is flagged regardless of cover adequacy."],
    ["rider_details", "String", "200", "Critical Illness 10L", "Attached riders, semicolon-separated."],
    ["policy_status", "String", "15", "ACTIVE", "ACTIVE, LAPSED, MATURED or SURRENDERED. Lapsed policies are excluded from cover but retained for reinstatement prompts."],
])

# ════════════════════════════════════════════════════════════
h1("Tax Utilisation API", "10")

h3("10.1  API Request")
field_table(REQ_HDR, REQ_W, [
    ["customer_id", "String", "20", "Mandatory", "CUST-88214", "Unique customer identifier."],
    ["consent_reference", "String", "50", "Mandatory", "CONS_MITRA_982731", "Consent artefact reference."],
    ["assessment_year", "String", "7", "Optional", "2027-28", "Assessment year. Defaults to the current one."],
])

h3("10.2  API Response")
field_table(RES_HDR, RES_W, [
    ["assessment_year", "String", "7", "2027-28", "Assessment year in force."],
    ["financial_year_end_date", "Date", "10", "31-03-27", "Financial year end. Determines the months remaining for deduction top-up — this must be derived from the date, never assumed."],
    ["tax_regime", "String", "10", "OLD", "OLD, NEW or UNDECIDED. When UNDECIDED, MITRA presents a comparison instead of a recommendation."],
    ["regime_confirmed_flag", "Boolean", "1", "false", "Whether the customer has confirmed the regime. Unconfirmed regimes are treated as an assumption and disclosed as such."],
    ["estimated_annual_income", "Decimal", "18,2", "1140000.00", "Estimated taxable income for the year."],
    ["estimated_slab_rate_pct", "Decimal", "5,2", "31.20", "Marginal rate including cess. Drives the estimated saving figure — a flat assumed rate misstates it for most customers."],
    ["section_code", "String", "10", "80C", "Deduction section: 80C, 80D, 80CCD1B, 80E, 24B."],
    ["deduction_limit", "Decimal", "18,2", "150000.00", "Statutory limit for the section. Sourced as a policy parameter so a Budget change requires no code release."],
    ["deduction_utilised", "Decimal", "18,2", "69000.00", "Amount utilised to date."],
    ["deduction_gap", "Decimal", "18,2", "81000.00", "Engineered as deduction_limit − deduction_utilised."],
    ["utilisation_verified_flag", "Boolean", "1", "true", "Whether utilisation is confirmed from instruments held, or self-declared. Unverified figures carry a disclosure."],
    ["ltcg_realised_ytd", "Decimal", "18,2", "0.00", "Long-term capital gains realised in the year to date."],
    ["ltcg_exemption_limit", "Decimal", "18,2", "125000.00", "Annual LTCG exemption. Policy parameter, revised at each Budget."],
    ["ltcg_exemption_remaining", "Decimal", "18,2", "125000.00", "Engineered as ltcg_exemption_limit − ltcg_realised_ytd. Drives the harvesting recommendation."],
    ["stcg_realised_ytd", "Decimal", "18,2", "0.00", "Short-term capital gains realised in the year to date."],
    ["advance_tax_paid_ytd", "Decimal", "18,2", "0.00", "Preferred. Enables advance-tax instalment reminders."],
])

# ════════════════════════════════════════════════════════════
h1("Derived Cashflow and Spending", "11")
para(
    "All fields in this section are engineered by MITRA from the Transactions API (Section 7). They "
    "are documented here because they are persisted, auditable, and may alternatively be supplied by "
    "the bank's analytics platform.", color=SOFT, size=9.5,
)

h3("11.1  Monthly aggregate (repeating block, one per month)")
field_table(RES_HDR, RES_W, [
    ["observation_month", "String", "7", "2026-06", "Month in YYYY-MM format."],
    ["total_income", "Decimal", "18,2", "95000.00", "Engineered. Sum of credits excluding self-transfers and refunds, which would otherwise inflate income."],
    ["total_spend", "Decimal", "18,2", "71350.00", "Engineered. Sum of debits excluding investments and self-transfers."],
    ["total_invested", "Decimal", "18,2", "8000.00", "Engineered. Debits categorised as INVESTMENTS."],
    ["net_surplus", "Decimal", "18,2", "15650.00", "Engineered as total_income − total_spend − total_invested. May be negative."],
    ["salary_credit_date", "Date", "10", "01-06-26", "Engineered. Detected salary credit date, used to time auto-invest instructions."],
    ["transaction_count", "Integer", "5", "148", "Records contributing to the month. A low count signals an incomplete window."],
    ["upi_transaction_count", "Integer", "5", "86", "Engineered. Drives the round-up micro-investing projection."],
    ["data_completeness_pct", "Decimal", "5,2", "100.00", "Engineered. Share of days in the month with transaction coverage. Months below 80 are excluded from averages rather than silently understating spend."],
])

h3("11.2  Rolling metrics")
field_table(RES_HDR, RES_W, [
    ["avg_monthly_income_6m", "Decimal", "18,2", "96416.67", "Engineered. Trailing 6-month mean income."],
    ["avg_monthly_spend_6m", "Decimal", "18,2", "63291.67", "Engineered. Trailing 6-month mean spend."],
    ["avg_monthly_invested_6m", "Decimal", "18,2", "8000.00", "Engineered. Trailing 6-month mean invested."],
    ["savings_rate_pct", "Decimal", "5,2", "34.35", "Engineered as (income − spend) ÷ income. Primary component of the health score."],
    ["income_volatility_cv", "Decimal", "5,4", "0.0412", "Engineered coefficient of variation of monthly income. Distinguishes salaried from self-employed cashflow and feeds risk capacity."],
    ["essential_spend_ratio_pct", "Decimal", "5,2", "62.40", "Engineered. Essential share of spend. Determines how much of a shortfall is genuinely addressable."],
    ["months_of_data_available", "Integer", "3", "6", "Engineered. Observation depth. Below 3, anomaly detection is suppressed."],
])

h3("11.3  Category aggregate (repeating block, one per category)")
field_table(RES_HDR, RES_W, [
    ["category_code", "String", "30", "DINING_DELIVERY", "See the permitted values in Section 7.3."],
    ["category_spend_amount", "Decimal", "18,2", "11800.00", "Engineered. Current-month spend in the category."],
    ["category_trailing_3m_avg", "Decimal", "18,2", "8100.00", "Engineered. Trailing 3-month mean, used as the anomaly baseline."],
    ["category_delta_pct", "Decimal", "7,2", "45.68", "Engineered. Deviation from baseline. Above +15% on a non-essential category raises a nudge."],
    ["essential_flag", "Boolean", "1", "false", "Whether the category is discretionary."],
    ["transaction_count", "Integer", "5", "34", "Transactions in the category this month."],
    ["top_merchant_name", "String", "100", "Swiggy", "Engineered. Largest merchant by value in the category."],
    ["top_merchant_amount", "Decimal", "18,2", "6420.00", "Engineered. Spend with that merchant."],
])

h3("11.4  Recurring payments (repeating block, one per merchant)")
note(
    "Deliberate limitation: a bank feed can establish that a charge recurred; it cannot establish "
    "whether the customer used the service. engagement_signal is therefore reported as UNKNOWN unless "
    "an authorised app-usage source is available, and MITRA's copy says \"charged monthly, no recent "
    "activity detected\" rather than \"unused\". Overstating this would be a claim the data does not support."
)
field_table(RES_HDR, RES_W, [
    ["merchant_id", "String", "40", "MRC_NETFLIX", "Normalised merchant identifier."],
    ["merchant_name", "String", "100", "Netflix", "Display name."],
    ["recurring_amount", "Decimal", "18,2", "649.00", "Engineered. Mean charge across observed occurrences."],
    ["recurring_cadence", "String", "12", "MONTHLY", "WEEKLY, MONTHLY, QUARTERLY or ANNUAL."],
    ["first_seen_date", "Date", "10", "11-03-25", "First observed charge in the window."],
    ["last_charged_date", "Date", "10", "11-08-26", "Most recent charge."],
    ["occurrence_count", "Integer", "3", "18", "Charges observed."],
    ["annualised_cost", "Decimal", "18,2", "7788.00", "Engineered. Cost projected over 12 months — the figure that makes the trade-off legible."],
    ["engagement_signal", "String", "10", "UNKNOWN", "ACTIVE, DORMANT or UNKNOWN. See the limitation note above."],
    ["detection_confidence", "Decimal", "3,2", "0.94", "Engineered. 0.00–1.00, based on amount consistency and cadence regularity."],
])

# ════════════════════════════════════════════════════════════
h1("MITRA Advisory Output (Outbound)", "12")
para(
    "Fields MITRA returns to the app and writes to the advisory audit log. Every field is engineered. "
    "Section 12.3 carries the provenance fields that make each recommendation reconstructible — a "
    "record-keeping requirement, not a convenience.", color=SOFT, size=9.5,
)

h3("12.1  Financial health score")
field_table(RES_HDR, RES_W, [
    ["financial_health_score", "Integer", "3", "68", "Engineered. Composite score, 0–100."],
    ["health_score_grade", "String", "15", "GOOD", "NEEDS_WORK, FAIR, GOOD or EXCELLENT."],
    ["savings_rate_score", "Decimal", "5,2", "21.30", "Engineered. Component score out of 25."],
    ["emergency_cover_score", "Decimal", "5,2", "17.40", "Engineered. Component score out of 25."],
    ["diversification_score", "Decimal", "5,2", "12.00", "Engineered. Component score out of 25."],
    ["goal_readiness_score", "Decimal", "5,2", "17.30", "Engineered. Component score out of 25."],
    ["emergency_cover_months", "Decimal", "5,2", "4.20", "Engineered as liquid balance ÷ average monthly spend."],
    ["equity_exposure_pct", "Decimal", "5,2", "17.30", "Engineered. Growth assets as a share of total portfolio."],
    ["score_delta_1m", "Decimal", "5,2", "2.00", "Engineered. Change since the prior month, so the customer sees direction rather than a bare number."],
])

h3("12.2  Advisory insights")
field_table(RES_HDR, RES_W, [
    ["nudge_id", "String", "30", "NDG_01J8X2P4", "Unique recommendation identifier."],
    ["nudge_kind", "String", "30", "SURPLUS_IDLE", "SURPLUS_IDLE, ALLOCATION_DRIFT, SPEND_ANOMALY, TAX_GAP, SUBSCRIPTION_WASTE, PROTECTION_GAP, EMERGENCY_FUND_LOW, FEE_DRAG, LTCG_HARVEST or LOAN_PREPAY."],
    ["nudge_priority", "Integer", "2", "1", "Rank within the current set."],
    ["nudge_severity", "String", "12", "OPPORTUNITY", "CRITICAL, WARNING, OPPORTUNITY or INFO."],
    ["nudge_title", "String", "120", "Rs 12,450 idle every month", "Headline shown to the customer."],
    ["quantified_benefit", "Decimal", "18,2", "1000000.00", "Engineered. Modelled rupee benefit over the stated horizon."],
    ["benefit_horizon_years", "Integer", "2", "10", "Horizon over which the benefit is modelled."],
    ["monthly_surplus", "Decimal", "18,2", "12450.00", "Engineered. Investable surplus after spend, existing investments and committed outflows."],
    ["allocation_drift_pct", "Decimal", "7,2", "-37.70", "Engineered. Largest deviation from the target allocation for the customer's risk band."],
    ["protection_gap_life", "Decimal", "18,2", "12100000.00", "Engineered. Shortfall against the recommended term-cover multiple."],
    ["protection_gap_health", "Decimal", "18,2", "1000000.00", "Engineered. Shortfall against the recommended health cover for the customer's city tier."],
    ["fee_drag_annual", "Decimal", "18,2", "1420.00", "Engineered. Annual cost of regular-plan holdings versus their direct equivalents."],
    ["projected_corpus_base", "Decimal", "18,2", "41820000.00", "Engineered. Projected corpus at target age, base scenario."],
    ["projected_corpus_low", "Decimal", "18,2", "28940000.00", "Engineered. Pessimistic scenario. Mandatory — a projection must never be presented as a single figure."],
    ["projected_corpus_high", "Decimal", "18,2", "61280000.00", "Engineered. Optimistic scenario."],
    ["financial_freedom_age", "Integer", "3", "51", "Engineered. Age at which projected corpus reaches 25× inflated annual expenses. Null where not reached by the target age."],
    ["disclaimer_text", "String", "500", "Projections are illustrative...", "Mandatory risk disclosure accompanying any projection."],
])

h3("12.3  Provenance and audit fields")
note(
    "These fields are what allow the bank to reconstruct, months later, exactly why a customer was "
    "told something — which inputs, which engine build, and which policy assumptions were in force. "
    "Advisory records are retained for 8 years under SEBI record-keeping norms."
)
field_table(RES_HDR, RES_W, [
    ["engine_version", "String", "30", "analytics@2.1.0", "Version of the calculation engine that produced the output."],
    ["policy_version", "String", "30", "policy@2026.08", "Version of the assumption set in force — expected returns, deduction limits, cover multiples."],
    ["computed_datetime", "Datetime", "20", "2026-08-24T09:15:00Z", "Computation timestamp."],
    ["data_as_of_datetime", "Datetime", "20", "2026-08-23T18:00:00Z", "Timestamp of the newest source record used."],
    ["staleness_indicator", "String", "10", "FRESH", "FRESH under 24h, STALE 24h–7d, EXPIRED beyond 7d or on consent revocation. The interface visibly degrades on EXPIRED rather than presenting stale figures with full confidence."],
    ["input_snapshot_ref", "String", "60", "SNAP_01J8X2P4K9", "Reference to the immutable input snapshot used for this computation."],
    ["assumption_set", "String", "500", "EXPECTED_RETURN_PCT=11; EMERGENCY_MONTHS=6", "Semicolon-separated assumptions applied, with their values."],
    ["customer_action", "String", "12", "SHOWN", "SHOWN, DISMISSED or ACTED_ON. Closes the audit loop between advice and outcome."],
])

# ════════════════════════════════════════════════════════════
h1("Standard Response Trailer", "13")
para(
    "Every API response carries these fields, following the trailer convention in the IDBI sample.",
    color=SOFT, size=9.5,
)
field_table(RES_HDR, RES_W, [
    ["data_period_from", "Date", "10", "01-08-25", "Start of the observation window covered by this response."],
    ["data_period_to", "Date", "10", "31-07-26", "End of the observation window."],
    ["data_freshness_date", "Date", "10", "20-08-26", "Date through which the feed is considered complete."],
    ["consent_reference", "String", "50", "CONS_MITRA_982731", "Consent artefact under which the data was released."],
    ["consent_expiry_date", "Date", "10", "24-08-27", "Consent expiry. MITRA stops all fetches and purges derived data past this date."],
    ["record_count", "Integer", "10", "148", "Records in this response page."],
    ["next_cursor", "String", "200", "eyJrIjoiMjAyNi0w", "Continuation token. Null on the final page."],
    ["response_status", "String", "20", "SUCCESS", "SUCCESS, PARTIAL or FAILURE. PARTIAL indicates some consented accounts could not be reached and must be surfaced, not silently absorbed."],
    ["response_code", "String", "10", "200", "HTTP-aligned status code."],
    ["error_message", "String", "250", "", "Human-readable error detail. Populated only where response_status is not SUCCESS."],
    ["trace_id", "String", "40", "1-68aa1f30-4c1d2e", "Correlation identifier for support and audit traceability."],
])

# ════════════════════════════════════════════════════════════
h1("Integration Requirements", "14")
para(
    "Summarised from the accompanying SANDBOX_REQUIREMENTS.md. These are the platform-level "
    "conditions for the field specification above to be delivered safely.", color=SOFT, size=9.5,
)

h2("14.1  Transport and security")
rows = [
    ["Protocol", "HTTPS, TLS 1.3. REST with JSON payloads."],
    ["Authentication", "OAuth 2.0 client credentials for service-to-service; OIDC federation to the bank's identity provider for customer sessions."],
    ["Authorisation", "Scoped per data domain and per consent purpose. A wealth-advisory token cannot read credit-assessment data."],
    ["Encryption", "TLS in transit; AES-256 with a bank-managed key at rest. Field-level encryption for PAN, account number and name."],
    ["Masking", "Account numbers, PAN, mobile and email masked at source. MITRA never receives unmasked identifiers."],
    ["Idempotency", "All state-changing calls carry an Idempotency-Key header, retained 24 hours."],
    ["Rate limits", "120 requests per minute per customer for reads; 10 per hour for ingestion jobs."],
    ["Residency", "All data, backups and logs held in India (ap-south-1 primary, ap-south-2 disaster recovery). No cross-border replication."],
]
simple_table(["Requirement", "Specification"], fit([1.85, 8.15]), rows, mono_col=-1)

h2("14.2  Data quality expectations")
bullet("Transaction history of at least 6 months; 24 months preferred. Below 3 months, anomaly detection is suppressed rather than shown at low confidence.")
bullet("NAV data no older than 3 business days. Older values are flagged stale to the customer.")
bullet("Balances refreshed at least daily for accounts under an active periodic consent.")
bullet("Unknown values returned as null, never as 0 — the two lead to materially different advice.")
bullet("A response covering only some consented accounts must set response_status to PARTIAL and name the unreachable accounts.")

h2("14.3  Service levels")
rows = [
    ["Profile, Accounts, Holdings", "p95 under 800 ms", "99.5% monthly"],
    ["Transactions (500-record page)", "p95 under 2 s", "99.5% monthly"],
    ["Advisory output", "p95 under 1.5 s", "99.0% monthly"],
    ["Statement ingestion (asynchronous)", "under 60 s for a 3-page PDF", "95% of jobs"],
]
simple_table(["Operation", "Latency target", "Availability"], fit([4.0, 3.0, 3.0]), rows, mono_col=-1)

# ════════════════════════════════════════════════════════════
h1("Appendix A — Prototype Data Gaps", "15")
para(
    "The current MITRA prototype runs entirely in the browser against two hand-authored customer "
    "profiles. The advisory calculations are genuine and port to a server unchanged; the data layer "
    "around them does not yet accept a live source. This appendix records the gaps that this field "
    "specification is intended to close, so reviewers can see what changes and what does not.",
)

h2("15.1  What is already real")
bullet("All advisory mathematics — SIP future value, required-instalment solving, loan amortisation, allocation drift, capital-gains harvesting and fee-drag projection.")
bullet("CSV statement parsing, transaction categorisation, monthly aggregation and recurring-payment detection.")
bullet("A deterministic rule-based advisor that answers without any language model — a genuine resilience property, retained by design.")

h2("15.2  What this specification replaces")
rows = [
    ["Simulated account connection", "Randomly generated holdings stand in for a broker or aggregator link.", "Sections 5–6, sourced via Account Aggregator."],
    ["Static market data", "A fixed 20-point index series and a fixed headline.", "Licensed exchange feed and AMFI NAV file."],
    ["Hand-authored peer benchmarks", "Cohort percentiles written per persona.", "Computed cohort statistics with a minimum cohort size of 1,000 for anonymity."],
    ["Embedded assumptions", "Emergency-fund target, tax slab, deduction limits and expected returns fixed in code.", "Versioned policy parameters returned in assumption_set (Section 12.3)."],
    ["Client-side credentials", "Prototype-only session handling and a language-model key held in the browser.", "Server-side identity federation and server-side model invocation."],
    ["Silent PDF handling", "PDF statement uploads are accepted but not parsed.", "Server-side extraction with an explicit per-stage job status."],
]
simple_table(["Prototype behaviour", "Current state", "Replaced by"], fit([2.35, 4.0, 3.65]), rows, mono_col=-1)

h2("15.3  Sequencing")
para(
    "The field specification does not depend on Account Aggregator onboarding. A synthetic corpus "
    "conforming to these field definitions — including a customer holding no investments, which the "
    "current prototype does not handle — unblocks the entire build while the aggregator "
    "agreement proceeds in parallel.",
)

# ════════════════════════════════════════════════════════════
h1("Appendix B — Open Points for IDBI", "16")
para("Items requiring a decision or confirmation from the bank before the field list can be frozen.", color=SOFT, size=9.5)

rows = [
    ["1", "Source of record for profile and accounts", "Core Banking direct, or Account Aggregator for all sources uniformly?", "Determines whether Sections 4–5 are one integration or two."],
    ["2", "Transaction history depth available", "Is 24 months retrievable, or is 6 the practical limit?", "Below 12 months, year-on-year comparison and seasonality adjustment are not possible."],
    ["3", "Categorisation ownership", "Does the bank supply category_code, or does MITRA derive it?", "If the bank supplies it, Section 7.3 must be reconciled with the existing internal taxonomy."],
    ["4", "Insurance data availability", "Are policies retrievable, including employer group cover?", "Employer cover that lapses on job change is the most commonly missed protection gap; without portable_flag the analysis materially understates it."],
    ["5", "Peer benchmark feasibility", "Can anonymised cohort statistics be computed internally?", "If not, the peer-comparison feature is withdrawn rather than shown against synthetic baselines."],
    ["6", "Advisory positioning", "Confirm education-and-guidance framing versus registered investment advice.", "Determines whether MITRA may name specific schemes or must restrict itself to asset-class guidance."],
    ["7", "Sandbox data source", "Account Aggregator sandbox, or synthetic corpus only for the first phase?", "Recommendation: synthetic first. Aggregator onboarding carries a 4–8 week lead time and should not gate the build."],
    ["8", "Policy parameter ownership", "Who maintains deduction limits, cover multiples and expected-return assumptions?", "These change with each Budget. Bank ownership is preferred so revisions require no code release."],
]
simple_table(["#", "Item", "Question", "Why it matters"], fit([0.4, 2.35, 3.5, 3.75]), rows, mono_col=-1)

doc.add_paragraph()
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("— End of document —")
r.font.size = Pt(9)
r.font.color.rgb = SOFT
r.font.italic = True

out = "/Users/sudarssan_n/Downloads/Code_Projects/idbi_hackathon_track1/docs/MITRA_Data_Field_Requirements.docx"
doc.save(out)
print("saved:", out)
