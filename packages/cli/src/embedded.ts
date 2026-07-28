// packages/cli/src/embedded.ts
import { PGlite } from '@electric-sql/pglite'
import { postgis } from '@electric-sql/pglite-postgis'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

export interface EmbeddedPostgres {
  connectionString: string
  db: PGlite
  server: PGLiteSocketServer
}

export async function startEmbeddedPostgres(
  dataDir: string,
  opts: { port?: number; host?: string } = {}
): Promise<EmbeddedPostgres> {
  const port = opts.port ?? 5433
  const host = opts.host ?? '127.0.0.1'

  const db = new PGlite(dataDir, { extensions: { postgis } })
  await db.exec('CREATE EXTENSION IF NOT EXISTS postgis')

  const server = new PGLiteSocketServer({ db, port, host })
  await server.start()

  return {
    // PGlite serves one connection at a time — pool_max_conns=1 keeps pgx from opening more.
    connectionString: `postgres://postgres@${host}:${port}/postgres?pool_max_conns=1`,
    db,
    server,
  }
}

export async function stopEmbeddedPostgres(instance: EmbeddedPostgres): Promise<void> {
  await instance.server.stop()
  await instance.db.close()
}
