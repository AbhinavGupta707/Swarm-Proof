export type PersistenceMode = "memory" | "postgres" | "supabase-rest";

export type PersistenceConfig = {
  mode: PersistenceMode;
  databaseUrlConfigured: boolean;
  artifactStorageProvider: string;
  artifactBucket: string | null;
};

export function getPersistenceConfig(): PersistenceConfig {
  return {
    mode: resolvePersistenceMode(),
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

function resolvePersistenceMode(): PersistenceMode {
  const override = process.env.SWARMPROOF_PERSISTENCE;
  if (override === "memory") {
    return "memory";
  }

  if (!process.env.DATABASE_URL) {
    return "memory";
  }

  if (override === "postgres" || override === "supabase-rest") {
    return override;
  }

  return process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
    ? "supabase-rest"
    : "postgres";
}
