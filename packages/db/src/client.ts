export type PersistenceMode = "memory" | "postgres";

export type PersistenceConfig = {
  mode: PersistenceMode;
  databaseUrlConfigured: boolean;
  artifactStorageProvider: string;
  artifactBucket: string | null;
};

export function getPersistenceConfig(): PersistenceConfig {
  return {
    mode: process.env.DATABASE_URL && process.env.SWARMPROOF_PERSISTENCE !== "memory" ? "postgres" : "memory",
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    artifactStorageProvider: process.env.ARTIFACT_STORAGE_PROVIDER ?? "memory",
    artifactBucket: process.env.SUPABASE_STORAGE_BUCKET ?? process.env.R2_BUCKET ?? null
  };
}

export function assertDatabaseConfigured() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Postgres-backed persistence. The memory fallback is active without it.");
  }
}
