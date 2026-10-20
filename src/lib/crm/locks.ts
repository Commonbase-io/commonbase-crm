import type { Tx } from "@/lib/db";

export async function lockCompany(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function lockContact(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function lockContacts(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    await lockContact(tx, id);
  }
}
