import type { companyInfo } from "@/lib/company";

// Substitutes {company} / {address} / {email} in legal prose. The email
// falls back to a neutral phrase so an unset NEXT_PUBLIC_SUPPORT_EMAIL
// never renders as a literal "{email}" in a contract.
export function fillCompany<T extends { title: string; paragraphs: string[] }>(sections: T[], company: ReturnType<typeof companyInfo>): T[] {
  const email = company.supportEmail || "—";
  const sub = (s: string) => s.replaceAll("{company}", company.legalName).replaceAll("{address}", company.address).replaceAll("{email}", email);
  return sections.map((s) => ({ ...s, title: sub(s.title), paragraphs: s.paragraphs.map(sub) }));
}
