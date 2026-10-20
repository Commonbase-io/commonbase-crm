import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL_MIGRATE });
const db = new PrismaClient({ adapter });

async function main() {
  const existing = await db.org.findUnique({ where: { slug: "northwind-demo" } });
  if (existing) {
    console.log("Seed data already present.");
    return;
  }

  const passwordHash = await hashPassword("Password1");
  const platform = await db.org.create({
    data: { name: "Commonbase Platform", slug: "platform", isPlatform: true },
  });
  await db.user.create({
    data: {
      orgId: platform.id,
      email: "platform.admin@example.com",
      name: "Platform Admin",
      passwordHash,
      role: "ADMIN",
      isPlatformAdmin: true,
    },
  });
  await db.$executeRaw`SELECT seed_default_pipeline(${platform.id}::uuid)`;

  const client = await db.org.create({ data: { name: "Northwind Demo", slug: "northwind-demo" } });
  const ada = await db.user.create({
    data: {
      orgId: client.id,
      email: "ada.example@example.com",
      name: "Ada Example",
      passwordHash,
      role: "ADMIN",
    },
  });
  const ben = await db.user.create({
    data: {
      orgId: client.id,
      email: "ben.example@example.com",
      name: "Ben Example",
      passwordHash,
      role: "MEMBER",
    },
  });
  await db.$executeRaw`SELECT seed_default_pipeline(${client.id}::uuid)`;
  const qualified = await db.stage.findFirstOrThrow({
    where: { orgId: client.id, name: "Qualified" },
  });
  const company = await db.company.create({
    data: {
      orgId: client.id,
      name: "Example Bakery",
      domain: "example-bakery.test",
      phone: "555-0100",
      city: "Example City",
      region: "EX",
      country: "Exampleland",
      ownerId: ada.id,
      notes: "Obviously fake local seed company.",
    },
  });
  const contact = await db.contact.create({
    data: {
      orgId: client.id,
      firstName: "Pat",
      lastName: "Example",
      email: "pat@example-bakery.test",
      title: "Owner",
      companyId: company.id,
      ownerId: ben.id,
    },
  });
  await db.$transaction(async (tx) => {
    const deal = await tx.deal.create({
      data: {
        orgId: client.id,
        name: "Website refresh",
        amountCents: 150000,
        stageId: qualified.id,
        companyId: company.id,
        ownerId: ada.id,
        status: "OPEN",
      },
    });
    await tx.dealContact.create({
      data: { orgId: client.id, dealId: deal.id, contactId: contact.id, companyId: company.id },
    });
  });
  await db.note.create({
    data: {
      orgId: client.id,
      body: "Met at the example farmers market.",
      authorId: ada.id,
      companyId: company.id,
    },
  });
  console.log("Seeded local demo org northwind-demo.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
