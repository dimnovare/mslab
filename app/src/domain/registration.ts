export type RegStatus = "awaiting_prepayment" | "confirmed" | "cancelled";

export function prepaymentDue(cents: number, choice: "full" | "half"): number {
  return choice === "full" ? cents : Math.ceil(cents / 2);
}

// Maria: a place is confirmed only after at least 50% has been paid.
export function registrationStatusAfterPayment(r: { status: RegStatus; paidCents: number }, totalCents: number): RegStatus {
  if (r.status === "cancelled") return "cancelled";
  return r.paidCents * 2 >= totalCents ? "confirmed" : "awaiting_prepayment";
}

/**
 * The price a registration's payment is measured against: the e-learning price, or for a contact course the group
 * price (group registration) or the individual price. null when the course has no such price.
 */
export function registrationPrice(
  course: { type: "e_learning" | "contact"; price: number | null; priceGroup: number | null; priceIndividual: number | null },
  kind: "group" | "individual",
): number | null {
  if (course.type === "e_learning") return course.price;
  return kind === "group" ? course.priceGroup : course.priceIndividual;
}
