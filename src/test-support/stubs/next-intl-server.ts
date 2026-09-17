// Translations resolve to their key (plus any values) so assertions can
// match on the key — e.g. "planLimit.bins" — without depending on copy.
export async function getTranslations(namespace?: string) {
  const t = (key: string, values?: Record<string, unknown>) =>
    `${namespace ? `${namespace}.` : ""}${key}${values ? ` ${JSON.stringify(values)}` : ""}`;
  return t;
}
export async function getLocale() {
  return "sq";
}
export async function getMessages() {
  return {};
}
