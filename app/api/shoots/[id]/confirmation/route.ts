import { getT } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/auth/session";
import { getShoot, shootResources } from "@/lib/db/repo/shoots";
import { getSettings } from "@/lib/db/repo/settings";
import { confirmationPdf } from "@/lib/pdf/build";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCtx();
  const { locale } = await getT();

  // getShoot is ctx-scoped, so a client asking for someone else's reference
  // gets a 404 rather than a 403 - which does not confirm it exists.
  const shoot = await getShoot(ctx, id);
  if (!shoot) return new Response("Not found", { status: 404 });

  const [assignments, settings] = await Promise.all([
    shootResources(ctx, id),
    getSettings(),
  ]);
  const pdf = await confirmationPdf({ shoot, assignments, settings, locale });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: a confirmation is usually read, not filed.
      "Content-Disposition": `inline; filename="${shoot.ref}-confirmation.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
