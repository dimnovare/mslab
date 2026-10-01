export type RegStatus = "awaiting_prepayment" | "confirmed" | "cancelled";

export function prepaymentDue(cents: number, choice: "full" | "half"): number {
  return choice === "full" ? cents : Math.ceil(cents / 2);
}

// Maria: a place is confirmed only after at least 50% has been paid.
export function registrationStatusAfterPayment(r: { status: RegStatus; paidCents: number }, totalCents: number): RegStatus {
  if (r.status === "cancelled") return "cancelled";
  return r.paidCents * 2 >= totalCents ? "confirmed" : "awaiting_prepayment";
}
