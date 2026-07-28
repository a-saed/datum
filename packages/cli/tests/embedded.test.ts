// packages/cli/tests/embedded.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { Client } from 'pg'
import { startEmbeddedPostgres, stopEmbeddedPostgres, type EmbeddedPostgres } from '../src/embedded.js'

let instance: EmbeddedPostgres | undefined

afterEach(async () => {
  if (instance) {
    await stopEmbeddedPostgres(instance)
    instance = undefined
  }
})

describe('startEmbeddedPostgres', () => {
  it('serves real Postgres wire protocol with PostGIS available', async () => {
    instance = await startEmbeddedPostgres('memory://', { port: 55432 })

    expect(instance.connectionString).toBe('postgres://postgres@127.0.0.1:55432/postgres?pool_max_conns=1')

    const client = new Client({ connectionString: instance.connectionString })
    await client.connect()
    try {
      const res = await client.query('SELECT postgis_version()')
      expect(res.rows[0].postgis_version).toBeDefined()
    } finally {
      await client.end()
    }
  })
})
