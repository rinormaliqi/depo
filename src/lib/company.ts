// The legal identity shown on /terms, /refunds, /contact and in the site
// footer. Env-driven because it changes exactly once — when the business
// is registered at ARBK — and that shouldn't need a code change.
export function companyInfo() {
  return {
    legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "SmartDepo",
    registrationNumber: process.env.NEXT_PUBLIC_COMPANY_REG_NO || "",
    address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || "Prishtinë, Kosovë",
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "pikembipresje@gmail.com",
  };
}

// Where a 3/6-month bank transfer (billing/actions.ts requestBankTransfer)
// and a 12-month contract's payment section (Epic #7) both point — real
// account details, so env-driven the same way the legal identity above is:
// they belong to the account holder, not in source control as a default.
export function bankDetails() {
  return {
    bankName: process.env.NEXT_PUBLIC_BANK_NAME || "",
    iban: process.env.NEXT_PUBLIC_BANK_IBAN || "",
    swift: process.env.NEXT_PUBLIC_BANK_SWIFT || "",
  };
}
