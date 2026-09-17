import { getT } from "@/lib/i18n";
import { requirePageRole } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  await requirePageRole("client");
  const { t } = await getT();

  return (
    <div className="hue-stagger">
      <PageHeader eyebrow={t.app.name} title={t.nav.myShoots} />
      <EmptyState title={t.common.nothingHere} body={t.nav.newRequest} />
    </div>
  );
}
