export const captured: unknown[] = [];
export function captureException(e: unknown) {
  captured.push(e);
}
export function captureRequestError() {}
export function init() {}
