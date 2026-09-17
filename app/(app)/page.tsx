import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n";
import { requireUser, homeFor } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  // Clients and crew have their own home; landing here means a stale bookmark.
  if (user.role === "client" || user.role === "crew") redirect(homeFor(user.role));

  const { t } = await getT();

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.tagline} title={t.nav.dashboard} />
      <EmptyState title={t.common.nothingHere} body={t.app.tagline} />
    </div>
  );
}
