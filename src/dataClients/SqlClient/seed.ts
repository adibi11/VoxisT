import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client";
import { hashPassword } from "../../auth/password";


const prisma = new PrismaClient();

const adminEmail = readEnv("SEED_ADMIN_EMAIL", "admin@example.com").toLowerCase();
const adminPassword = readSeedPassword();
const adminDisplayName = readEnv("SEED_ADMIN_DISPLAY_NAME", "Platform Admin");

const businessName = readEnv("SEED_BUSINESS_NAME", "Voxis Demo Business");
const businessPhone = readEnv("SEED_BUSINESS_PHONE", "+15559999999");
const businessEmail = readEnv("SEED_BUSINESS_EMAIL", "demo-business@example.com");

async function main(): Promise<void> {
  const admin = await prisma.appUser.upsert({
    where: {
      email: adminEmail
    },
    create: {
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      displayName: adminDisplayName,
      platformRole: "admin"
    },
    update: {
      displayName: adminDisplayName,
      platformRole: "admin",
      passwordHash: hashPassword(adminPassword)
    }
  });

  const existingBusiness = await prisma.business.findFirst({
    where: {
      OR: [
        { businessEmail },
        { businessPhone }
      ]
    }
  });

  const business = existingBusiness
    ? await prisma.business.update({
        where: {
          id: existingBusiness.id
        },
        data: seedBusinessData()
      })
    : await prisma.business.create({
        data: seedBusinessData()
      });

  await prisma.businessUser.upsert({
    where: {
      userId_businessId: {
        userId: admin.id,
        businessId: business.id
      }
    },
    create: {
      userId: admin.id,
      businessId: business.id,
      role: "owner"
    },
    update: {
      role: "owner"
    }
  });

  console.log("Seed completed");
  console.log(`Admin: ${admin.email}`);
  console.log(`Business: ${business.id} - ${business.businessName}`);
}

function seedBusinessData() {
  return {
    businessName,
    businessPhone,
    businessEmail,
    language: "en"
  };
}

function readEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function readSeedPassword(): string {
  const password = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (password) {
    return password;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SEED_ADMIN_PASSWORD is required when NODE_ENV=production");
  }

  return "change-me-now";
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
