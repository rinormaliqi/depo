// Shared by the server guard and the two quantity inputs, so the number
// the form refuses and the number the action refuses cannot drift apart.
// Kept in its own module because both inputs are client components and
// src/lib/stock.ts reaches for the database.
//
// stock.quantity and movements.quantity are `integer`, so anything past
// 2^31 came back from Postgres as "integer out of range" — which attempt()
// treats as a bug: the person saw the generic "something went wrong" and
// Sentry got an alert for what was only a typo. This cap sits well under
// the column's own limit on purpose: nobody receives a million of anything
// into one bin, so a number that large is a slip worth catching while it
// still means something to whoever typed it.
export const MAX_MOVEMENT_QUANTITY = 1_000_000;
