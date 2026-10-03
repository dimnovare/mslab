import type { NextStep } from "@/domain/account-cards";
import type { Dict } from "@/i18n/locales";
import { fill } from "@/i18n/format";

/**
 * A card's one sentence about what to do next (spec 2.1 rule 5): the dictionary text of `step.key` with its vars, which
 * domain/account-cards.ts nextStep has already formatted for the page's language (amounts, dates, times).
 */
export function NextStepLine({ step, texts, className }: { step: NextStep; texts: Dict["account"]["next"]; className?: string }) {
  return (
    <p className={className} data-next-step={step.key}>
      {fill(texts[step.key], step.vars)}
    </p>
  );
}
