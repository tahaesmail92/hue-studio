import { getT } from "@/lib/i18n/server";
import { requireCtx } from "@/lib/auth/session";
import { getShoot, shootResources } from "@/lib/db/repo/shoots";
import { getSettings } from "@/lib/db/repo/settings";
import { callSheetPdf } from "@/lib/pdf/build";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireCtx();
  const { locale } = await getT();

  // The call sheet carries crew names, kit and the producer's notes, so it is
  // for the people working the day - not for the client.
  if (ctx.role === "client") return new Response("Not found", { status: 404 });

  const shoot = await getShoot(ctx, id);
  if (!shoot) return new Response("Not found", { status: 404 });

  const [assignments, settings] = await Promise.all([
    shootResources(ctx, id),
    getSettings(),
  ]);
  const pdf = await callSheetPdf({ shoot, assignments, settings, locale });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${shoot.ref}-callsheet.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
