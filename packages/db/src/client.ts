export type PersistenceMode = "memory" | "prisma-ready";

export type PersistenceConfig = {
  mode: PersistenceMode;
  databaseUrlConfigured: boolean;
  artifactStorageProvider: string;
  artifactBucket: string | null;
};

export function getPersistenceConfig(): PersistenceConfig {
  return {
    mode: process.env.DATABASE_URL ? "prisma-ready" : "memory",
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    artifactStorageProvider: process.env.ARTIFACT_STORAGE_PROVIDER ?? "memory",
    artifactBucket: process.env.SUPABASE_STORAGE_BUCKET ?? process.env.R2_BUCKET ?? null
  };
}

export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Prisma-backed persistence. The memory fallback is active without it.");
  }
}
