import "dotenv/config";
import { PrismaClient } from "../../generated/prisma/client";
import { hashPassword } from "../../auth/password";


const prisma = new PrismaClient();

const adminEmail = readEnv("SEED_ADMIN_EMAIL", "admin@example.com").toLowerCase();
const adminPassword = readSeedPassword();
const adminDisplayName = readEnv("SEED_ADMIN_DISPLAY_NAME", "Platform Admin");

const businessName = readEnv("SEED_BUSINESS_NAME", "Voxis Demo Business");
const businessPhone = readEnv("SEED_BUSINESS_PHONE", "whatsapp:+15559999999");
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

  const seedParameters: Array<{
    paramName: string;
    paramType: "CATEGORICAL" | "CONTINUOUS" | "TIME" | "TEXT";
    config?: object;
  }> = [
    { paramName: "name", paramType: "TEXT" },
    { paramName: "service", paramType: "CATEGORICAL", config: { options: ["Consultation", "Course", "Workshop"] } },
    { paramName: "preferredDate", paramType: "TIME" },
    { paramName: "city", paramType: "CATEGORICAL", config: { options: ["Tel Aviv", "Haifa", "Jerusalem", "Beer Sheva"] } },
    { paramName: "budget", paramType: "CONTINUOUS", config: { min: 0, max: 100000, unit: "ILS" } }
  ];
  for (const parameter of seedParameters) {
    await prisma.businessParameter.upsert({
      where: {
        businessId_paramName: {
          businessId: business.id,
          paramName: parameter.paramName
        }
      },
      create: {
        businessId: business.id,
        paramName: parameter.paramName,
        paramType: parameter.paramType,
        config: parameter.config
      },
      update: {
        paramType: parameter.paramType,
        config: parameter.config
      }
    });
  }

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

  await prisma.businessContext.upsert({
    where: {
      businessId: business.id
    },
    create: seedBusinessContextData(business.id),
    update: seedBusinessContextData(business.id)
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
    starterMessage: "Hi! Thanks for reaching out. How can I help you today?",
    enderMessage: "Thanks, we have everything we need. We will follow up shortly.",
    escalationMessage: "I am escalating this to a human team member who can help from here.",
    language: "en"
  };
}

function seedBusinessContextData(businessId: number) {
  return {
    businessId,
    profileName: businessName,
    profileLanguage: "en",
    profileTone: "warm, concise, professional",
    description: "A demo service business for testing Voxis conversation flows.",
    serviceCatalog: {
      allowedServices: ["consulting", "home cleaning", "office cleaning", "deep cleaning"],
      commonIntents: ["quote request", "schedule service", "ask about pricing", "reschedule visit"]
    },
    conversationPolicy: {
      paceWhen: ["customer is worried about price", "customer is unsure", "customer asks for time"],
      escalateWhen: ["angry customer", "urgent complaint", "unsupported service"],
      closeWhen: ["all required params are collected", "customer confirms no more questions"]
    },
    knownClientContext: {
      summary: "No reusable client context has been collected yet.",
      reusablePreferences: [],
      previousAnswers: {}
    }
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
