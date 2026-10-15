import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const syncSnapshots = sqliteTable("opentavern_sync", {
  tokenHash: text("token_hash").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const syncMetadata = sqliteTable("opentavern_sync_v2_meta", {
  tokenHash: text("token_hash").primaryKey(),
  manifestHash: text("manifest_hash").notNull(),
  manifestChunks: integer("manifest_chunks").notNull(),
  manifestBytes: integer("manifest_bytes").notNull(),
  revision: integer("revision").notNull(),
  updatedAt: integer("updated_at").notNull(),
  lastSaved: integer("last_saved").notNull(),
});

export const syncChunks = sqliteTable("opentavern_sync_v2_chunks", {
  tokenHash: text("token_hash").notNull(),
  objectHash: text("object_hash").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  chunkCount: integer("chunk_count").notNull(),
  data: text("data").notNull(),
  chunkHash: text("chunk_hash").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.tokenHash, table.objectHash, table.chunkIndex] }),
]);

export const syncLocks = sqliteTable("opentavern_sync_v2_locks", {
  tokenHash: text("token_hash").primaryKey(),
  lockId: text("lock_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});
