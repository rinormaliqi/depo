import { disposableDomains } from "./disposable-domains";

// Providers where `first.last` and `firstlast` deliver to the same inbox.
// Only Google does this; Outlook, Yahoo, etc. treat dots as significant.
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// Collapse the aliases most providers hand out for free — `me+anything@`
// (Gmail, Outlook, Fastmail, Proton, iCloud all support it) and Gmail's
// dot-insensitivity — so one inbox maps to one normalized string. This is
// what `users.normalized_email`'s unique constraint runs on; the raw
// address is still what we send to. Not exhaustive (a determined abuser
// can always buy a domain), just enough that the trivially free tricks
// stop yielding a fresh 30-day trial each.
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at === -1) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  if (domain === "googlemail.com") domain = "gmail.com";

  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replace(/\./g, "");

  return `${local}@${domain}`;
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at === -1 ? "" : email.slice(at + 1).toLowerCase();
}

export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  // Match subdomains too — `x.mailinator.com` is still mailinator.
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (disposableDomains.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
