import { requireRoom } from "@/lib/capabilities";

// Kept as the names the actions already call; the checks live in
// src/lib/capabilities.ts (requireRoom) next to everything else that
// decides what an org may do.
export const assertCanAddBins = (organizationId: string, additional: number) => requireRoom(organizationId, "bins", additional);
export const assertCanAddSeats = (organizationId: string, additional: number) => requireRoom(organizationId, "users", additional);
export const assertCanAddFacilities = (organizationId: string, additional: number) => requireRoom(organizationId, "facilities", additional);
