import type { RegStatus } from "@/domain/registration";
import { adminEt } from "@/i18n/dict/admin";
import ui from "./ui.module.css";

const TONE: Record<RegStatus, string> = { awaiting_prepayment: ui.warn, confirmed: ui.ok, cancelled: ui.bad };

/** "Ootab ettemaksu" / "Kinnitatud" / "Tühistatud" (B .tag: rose, green, red). */
export function StatusPill({ status }: { status: RegStatus }) {
  return (
    <span className={`${ui.tag} ${TONE[status]}`} data-reg-status={status}>
      {adminEt.registrations.status[status]}
    </span>
  );
}
