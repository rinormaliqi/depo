// redirect() in Next works by throwing; mirror the digest so attempt()
// rethrows it like production does.
export function redirect(url: string): never {
  const e = new Error("NEXT_REDIRECT") as Error & { digest: string; url: string };
  e.digest = `NEXT_REDIRECT;replace;${url};307;`;
  e.url = url;
  throw e;
}
export function notFound(): never {
  const e = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
  e.digest = "NEXT_NOT_FOUND";
  throw e;
}
