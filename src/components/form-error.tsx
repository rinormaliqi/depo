// Inline error under a form, for validation that belongs next to the
// fields (a wrong password, a missing name). Outcomes that aren't about
// a field — saved, booked, blocked by plan or role — go through the
// notification system instead; this is the one style for the rest.
export function FormError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="form-error">
      {children}
    </p>
  );
}
