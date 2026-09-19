"use client";

import { createContext, useContext, type ReactElement } from "react";
import type { Capabilities, Capability } from "@/lib/capabilities";
import { useNotify } from "@/components/notifications";

// The UI half of src/lib/capabilities.ts. The root layout resolves the
// signed-in user's capabilities once per request and hands them (plus the
// translated reason for each blocked one) down here; components ask
// `useCapabilities()` or wrap a control in `<Gate>`.
//
// <Gate mode="hide">   — render nothing when blocked (default): the
//                        worker never sees "Edit layout".
// <Gate mode="disable"> — keep the control visible but inert, and explain
//                        via a toast when it's tapped: for things a user
//                        could get by upgrading or verifying, where hiding
//                        would just be confusing.

export type ClientCapabilities = Capabilities & { messages: Partial<Record<Capability, string>> };

const Ctx = createContext<ClientCapabilities | null>(null);

export function CapabilitiesProvider({ value, children }: { value: ClientCapabilities | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCapabilities(): ClientCapabilities | null {
  return useContext(Ctx);
}

export function useCan(capability: Capability): boolean {
  return useContext(Ctx)?.can[capability] ?? false;
}

// The toast for "you tapped something you can't do" — same text the
// server action would have returned.
export function useExplainBlocked() {
  const caps = useContext(Ctx);
  const notify = useNotify();
  return (capability: Capability) => {
    const message = caps?.messages[capability];
    if (message) notify.warning(message);
  };
}

export function Gate({
  capability,
  mode = "hide",
  children,
  fallback = null,
}: {
  capability: Capability;
  mode?: "hide" | "disable";
  children: ReactElement<{ onClick?: (e: React.MouseEvent) => void; "aria-disabled"?: boolean; className?: string; style?: React.CSSProperties }>;
  fallback?: React.ReactNode;
}) {
  const caps = useContext(Ctx);
  const explain = useExplainBlocked();
  const allowed = caps?.can[capability] ?? false;
  if (allowed) return children;
  if (mode === "hide") return <>{fallback}</>;
  // Cloned rather than wrapped, so layout (a flex row of buttons) is untouched.
  const child = children;
  return (
    <child.type
      {...child.props}
      aria-disabled
      className={[child.props.className, "is-blocked"].filter(Boolean).join(" ")}
      onClick={(e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        explain(capability);
      }}
    />
  );
}
