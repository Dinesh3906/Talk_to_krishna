import { assertSchemaCompatible, Queryable } from './db/migration-manifest.js';

export async function startApiAfterSchemaCheck<T>(
  database: Queryable,
  listen: () => T,
): Promise<T> {
  await assertSchemaCompatible(database);
  return listen();
}
