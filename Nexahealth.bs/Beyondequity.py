from matplotlib.backends.backend_pdf import PdfPages
import matplotlib.pyplot as plt
import textwrap

# ---------- Content preparation ----------

# Regulatory Checklist
reg_lines = [
    "NexaHealth Pilot – One‑Pager Regulatory Checklist",
    "",
    "1. Licensing & Approvals",
    "   • NAFDAC: Obtain Tech‑Partner Letter of No Objection.",
    "   • Pharmacy Council of Nigeria: Notify for pilot under \"digital tool\" category.",
    "   • NHREC: Ethics review if collecting clinical outcome data.",
    "",
    "2. Data Protection & Privacy (NDPR)",
    "   • Name Data Protection Officer (DPO).",
    "   • Draft user consent form (English + Pidgin).",
    "   • Register processing activities with NITDA.",
    "",
    "3. Medical & Clinical Safety",
    "   • Secure on‑call licensed pharmacist / physician advisor.",
    "   • Verify drug database accuracy ≥ 98% against NAFDAC master list.",
    "   • Define adverse‑event escalation protocol (24 h reporting).",
    "",
    "4. Cybersecurity & Infrastructure",
    "   • TLS 1.2+ end‑to‑end encryption.",
    "   • Host servers in Nigeria or GDPR‑adequate region; run penetration test pre‑launch.",
    "   • Daily automated backups with 30‑day retention.",
    "",
    "5. User Experience & Legal",
    "   • Terms of Use: clearly state \"information only, not a doctor\" disclaimer.",
    "   • Local‑language interface (Yoruba, Hausa) accessibility audit.",
    "",
    "6. Reporting & Audit",
    "   • Monthly compliance report to NAFDAC pilot officer.",
    "   • Maintain incident logbook & data‑breach notification plan (≤ 72 h)."
]

# What Else You Need to Know (select bullet form)
extra_lines = [
    "What a 200‑Level Founder Needs to Know – Beyond Equity",
    "",
    "• Legal & Regulatory: Register with NAFDAC, learn NDPR, add disclaimers.",
    "• Data Ethics: Encrypt data, anonymise datasets, publish Data Respect Manifesto.",
    "• Clinical Validation: Partner with pharmacist, run accuracy study.",
    "• Scalable Tech: Micro‑services + Docker; future‑proof for NexaGrid.",
    "• Partnerships: Secure NAFDAC, PSN, WHO Africa early.",
    "• Non‑Dilutive Grants: UNICEF Innovation, Google Black Founders Fund.",
    "• Culture & Hiring: Define core values; 4‑year vesting for team.",
    "• Go‑to‑Market: Lagos pilot, incentivise first 1K users with airtime.",
    "• Balanced Execution: 10‑15 focused hrs/week; protect mental health.",
    "• Holding‑Company Compliance: Delaware C‑Corp parent + NG subsidiary.",
    "• IP & Trademark: File \"NexaHealth\" & \"Nexa‑Constellations\" trademarks.",
    "• Exit Strategy: Decide IPO vs acquisition; influences term sheets.",
    "• Personal Brand: Monthly LinkedIn threads, local talks.",
    "• Risk Matrix: GPU shortage, regs, cash crunch — map mitigations.",
    "• Continuous Learning: HIPAA/GDPR online course, follow e‑health journals."
]

# ---------- PDF generation ----------
pdf_path = "/mnt/data/NexaHealth_Regulatory_and_FounderGuide.pdf"
with PdfPages(pdf_path) as pdf:
    # First page - Regulatory Checklist
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    ax.axis('off')
    y = 0.95
    for line in reg_lines:
        wrapped = textwrap.wrap(line, 100)
        for w in wrapped:
            ax.text(0.05, y, w, fontsize=10, va='top')
            y -= 0.028
    pdf.savefig(fig)
    plt.close(fig)
    
    # Second page - Founder Guide
    fig, ax = plt.subplots(figsize=(8.27, 11.69))
    ax.axis('off')
    y = 0.95
    for line in extra_lines:
        wrapped = textwrap.wrap(line, 100)
        for w in wrapped:
            ax.text(0.05, y, w, fontsize=10, va='top')
            y -= 0.028
    pdf.savefig(fig)
    plt.close(fig)

pdf_path
