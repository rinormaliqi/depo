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
