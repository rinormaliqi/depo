// In-memory cookie jar standing in for next/headers. Tests reset it
// between cases via resetCookies().
const jar = new Map<string, string>();

export async function cookies() {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  };
}

export async function headers() {
  return new Headers({ host: "test.local" });
}

export function resetCookies() {
  jar.clear();
}
