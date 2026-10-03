import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { CONTRACT_TEMPLATE } from "@/content/contract-template";
import type { Locale } from "@/i18n/locales";
import { bankDetails, companyInfo } from "@/lib/company";
import type { ContractPriceBreakdown } from "@/lib/billing-plans";

export type ContractPdfInput = {
  locale: Locale;
  planName: string;
  months: number;
  pricing: ContractPriceBreakdown;
  clientInfo: { legalName: string; registrationNumber: string; address: string; contactName: string; contactEmail: string };
  generatedAt: Date;
};

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4 in points
const MARGIN = 56;
const BODY_SIZE = 10.5;
const TITLE_SIZE = 16;
const CLAUSE_TITLE_SIZE = 11.5;
const LINE_HEIGHT = BODY_SIZE * 1.45;

function eur(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

// pdf-lib draws single lines only — this wraps `text` to fit `maxWidth` at
// `size`, breaking on spaces (a contract's prose has none of the long
// unbreakable tokens that would need char-level wrapping).
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function substitute(text: string, tokens: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, key: string) => tokens[key] ?? m);
}

export async function generateContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const { locale, planName, months, pricing, clientInfo, generatedAt } = input;
  const company = companyInfo();
  const bank = bankDetails();

  const tokens: Record<string, string> = {
    companyLegalName: company.legalName,
    companyAddress: company.address,
    clientLegalName: clientInfo.legalName,
    clientAddress: clientInfo.address,
    clientRegistrationNumber: clientInfo.registrationNumber || "—",
    clientContactName: clientInfo.contactName,
    planName,
    months: String(months),
    monthlyPrice: eur(pricing.monthlyPriceCents),
    standardTotal: eur(pricing.standardTotalCents),
    discountMonths: String(pricing.monthlyPriceCents ? Math.round(pricing.discountCents / pricing.monthlyPriceCents) : 0),
    discountAmount: eur(pricing.discountCents),
    finalTotal: eur(pricing.finalTotalCents),
    bankName: bank.bankName || "—",
    bankIban: bank.iban || "—",
    bankSwiftLine: bank.swift ? ` · SWIFT ${bank.swift}` : "",
  };

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_SIZE[0] - MARGIN * 2;

  let page = doc.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) {
      page = doc.addPage(PAGE_SIZE);
      y = PAGE_SIZE[1] - MARGIN;
    }
  }

  function drawLine(text: string, useFont: PDFFont, size: number, gap = LINE_HEIGHT) {
    ensureSpace(gap);
    page.drawText(text, { x: MARGIN, y, size, font: useFont, color: rgb(0.1, 0.1, 0.1) });
    y -= gap;
  }

  function drawParagraph(text: string, useFont: PDFFont, size: number) {
    for (const line of wrap(text, useFont, size, maxWidth)) drawLine(line, useFont, size);
  }

  const title = locale === "sq" ? "KONTRATË SHËRBIMI — SMARTDEPO" : "SERVICE CONTRACT — SMARTDEPO";
  drawLine(title, bold, TITLE_SIZE, TITLE_SIZE * 1.4);
  const dateLabel = locale === "sq" ? "Data" : "Date";
  drawLine(`${dateLabel}: ${generatedAt.toISOString().slice(0, 10)}`, font, BODY_SIZE, LINE_HEIGHT * 1.6);

  for (const clause of CONTRACT_TEMPLATE[locale]) {
    ensureSpace(CLAUSE_TITLE_SIZE * 1.4 + LINE_HEIGHT);
    drawLine(clause.title, bold, CLAUSE_TITLE_SIZE, CLAUSE_TITLE_SIZE * 1.6);
    for (const paragraph of clause.paragraphs) {
      if (typeof paragraph !== "string" && pricing.discountCents === 0) continue;
      drawParagraph(substitute(typeof paragraph === "string" ? paragraph : paragraph.text, tokens), font, BODY_SIZE);
      y -= LINE_HEIGHT * 0.4;
    }
    y -= LINE_HEIGHT * 0.3;
  }

  // Signatures — two blank lines side by side, dated where each party signs.
  ensureSpace(LINE_HEIGHT * 6);
  y -= LINE_HEIGHT;
  const colWidth = maxWidth / 2 - 14;
  const leftX = MARGIN;
  const rightX = MARGIN + maxWidth / 2 + 14;
  const sigLabel = locale === "sq" ? "Nënshkrimi" : "Signature";
  const dateSigLabel = locale === "sq" ? "Data" : "Date";
  page.drawText("SmartDepo", { x: leftX, y, size: BODY_SIZE, font: bold });
  page.drawText(tokens.clientLegalName, { x: rightX, y, size: BODY_SIZE, font: bold });
  y -= LINE_HEIGHT * 2.2;
  page.drawLine({ start: { x: leftX, y }, end: { x: leftX + colWidth, y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) });
  page.drawLine({ start: { x: rightX, y }, end: { x: rightX + colWidth, y }, thickness: 0.8, color: rgb(0.3, 0.3, 0.3) });
  y -= LINE_HEIGHT;
  page.drawText(`${sigLabel} · ${dateSigLabel}`, { x: leftX, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(`${sigLabel} · ${dateSigLabel}`, { x: rightX, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });

  return doc.save();
}
