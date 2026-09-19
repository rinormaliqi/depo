import { CAPABILITIES, blockMessage, getCapabilities } from "@/lib/capabilities";
import type { ClientCapabilities } from "@/components/capabilities";

// What the root layout passes to <CapabilitiesProvider>: the resolved
// capabilities plus, for each blocked one, the translated reason — so
// the client never needs the translation tables for this.
export async function capabilitiesForClient(): Promise<ClientCapabilities | null> {
  const caps = await getCapabilities();
  if (!caps) return null;
  const messages: ClientCapabilities["messages"] = {};
  await Promise.all(
    CAPABILITIES.map(async (c) => {
      const reason = caps.reason[c];
      if (reason) messages[c] = await blockMessage(reason, c);
    }),
  );
  return { ...caps, messages };
}
