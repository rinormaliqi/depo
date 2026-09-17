// An error whose message is meant for the person on the other end —
// "Only managers can change the layout", "This plan allows up to 500
// bins". attempt() (src/lib/action-result.ts) passes these messages
// through to the browser as-is. Anything else that escapes an action is
// treated as a bug: reported to Sentry, and the user gets a generic line
// instead of a stack-trace fragment or a raw SQL failure.
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
