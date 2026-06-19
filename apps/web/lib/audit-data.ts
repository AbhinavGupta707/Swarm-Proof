import { getAuditOverviewAsync, getSharedReportAsync } from "@swarmproof/db";
import type { AuditSummary } from "@swarmproof/types";
import { demoAudit } from "./demo-data";

export async function getAuditForPage(auditId: string): Promise<AuditSummary> {
  try {
    return await getAuditOverviewAsync(auditId);
  } catch {
    return demoAudit;
  }
}

export async function getSharedAuditForPage(shareToken: string): Promise<AuditSummary> {
  return await getSharedReportAsync(shareToken) ?? demoAudit;
}
