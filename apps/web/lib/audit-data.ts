import { getAuditOverview, getSharedReport } from "@swarmproof/db";
import type { AuditSummary } from "@swarmproof/types";
import { demoAudit } from "./demo-data";

export function getAuditForPage(auditId: string): AuditSummary {
  try {
    return getAuditOverview(auditId);
  } catch {
    return demoAudit;
  }
}

export function getSharedAuditForPage(shareToken: string): AuditSummary {
  return getSharedReport(shareToken) ?? demoAudit;
}
