export type SeatState = "open" | "few" | "full" | "cancelled";

export function seatsLeft(capacity: number, confirmed: number): number {
  return Math.max(0, capacity - confirmed);
}

export function seatState(s: { status: "scheduled" | "cancelled"; capacity: number }, confirmed: number): SeatState {
  if (s.status === "cancelled") return "cancelled";
  const left = seatsLeft(s.capacity, confirmed);
  return left === 0 ? "full" : left <= 2 ? "few" : "open";
}
