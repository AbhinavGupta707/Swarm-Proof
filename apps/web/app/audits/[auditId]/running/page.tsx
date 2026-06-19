import { getAuditEventsAsync } from "@swarmproof/db";
import { getAuditForPage } from "@/lib/audit-data";
import { RunningDashboard } from "./running-dashboard";

export const dynamic = "force-dynamic";

export default async function RunningAuditPage({ params }: { params: Promise<{ auditId: string }> }) {
  const { auditId } = await params;
  const audit = await getAuditForPage(auditId);
  let initialEventCount = audit.eventCount ?? 0;

  try {
    if (audit.id === auditId) {
      const events = await getAuditEventsAsync(auditId);
      initialEventCount = events.eventCount ?? events.events.length;
    }
  } catch {
    initialEventCount = audit.eventCount ?? 0;
  }

  return <RunningDashboard initialAudit={audit} initialEventCount={initialEventCount} />;
}
