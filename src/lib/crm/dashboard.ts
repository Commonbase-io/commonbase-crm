import type { SessionUser } from "@/lib/auth/session";
import { withOrg } from "@/lib/db";

export async function getDashboard(session: SessionUser) {
  return withOrg(session.orgId, session.id, async (tx) => {
    const [companies, contacts, openDeals, recent] = await Promise.all([
      tx.company.count({ where: { archivedAt: null } }),
      tx.contact.count({ where: { archivedAt: null } }),
      tx.deal.count({ where: { archivedAt: null, status: "OPEN" } }),
      tx.deal.findMany({
        where: { archivedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          name: true,
          amountCents: true,
          currency: true,
          status: true,
          company: { select: { name: true } },
          stage: { select: { name: true } },
        },
      }),
    ]);
    return { companies, contacts, openDeals, recent };
  });
}
