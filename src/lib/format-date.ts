// `Date.prototype.toLocaleDateString()` formats using the runtime's ambient
// locale/timezone, which can differ between the server that renders a page
// and the browser that hydrates it — producing a React hydration mismatch
// the moment a formatted date appears in a client component's initial
// render. Uses the UTC getters specifically (not just a fixed locale)
// because the server and a viewer's browser can also be in genuinely
// different timezones, and only UTC guarantees both compute the same
// calendar date for the same instant regardless of where each one runs.
export function formatDate(d: Date | string) {
  const date = new Date(d);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
