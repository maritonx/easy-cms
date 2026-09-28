import { resolve } from 'node:path'
import type {
  Database,
  DatabaseInitArgs,
  DatabaseTransfer,
  FindArgs,
  ID,
  PaginatedDocs,
  RawDocument,
  Where,
} from '@easy-cms/core'
import { QueryError } from '@easy-cms/core'
import { asc, count, eq, getTableColumns, getTableName, inArray } from 'drizzle-orm'
import type { AnyColumn, AnyTable, Dialect, DrizzleDb, SqlRunner } from './dialect.js'
import {
  deleteDocument,
  hydrate,
  insertDocument,
  replaceDocument,
  toDocument,
} from './documents.js'
import { Migrator } from './migrations.js'
import { WhereBuilder } from './query.js'
import {
  buildSchema,
  type CollectionModel,
  migrationsTableName,
  type SchemaModel,
} from './schema.js'

export const DEFAULT_TABLE_PREFIX = 'ecms_'
export const DEFAULT_MIGRATION_DIR = 'easy-cms/migrations'

export interface DrizzleAdapterOptions {
  /** Prefix for every table Easy CMS creates. Default `ecms_`. */
  readonly tablePrefix?: string
  /** Where migration files live, relative to the project root. Default `easy-cms/migrations`. */
  readonly migrationDir?: string
}

/** A driver connection an adapter opened. */
export interface Connection {
  readonly db: DrizzleDb
  readonly runner: SqlRunner
  /**
   * With a single-writer dialect: identifies the database (e.g. the SQLite file), so every
   * instance in this process that writes to it shares one queue.
   */
  readonly writeQueue?: string
  close(): Promise<void>
}

/** Writes in progress per single-writer database, shared by instances in this process. */
const writeQueues = new Map<string, Promise<unknown>>()

/**
 * Builds the schema for the config, pushes or verifies it, and returns a `Database`.
 * Closes the connection if startup fails.
 */
export async function connectDatabase(
  dialect: Dialect,
  connection: Connection,
  args: DatabaseInitArgs,
  options: DrizzleAdapterOptions = {},
): Promise<Database> {
  const prefix = options.tablePrefix ?? DEFAULT_TABLE_PREFIX
  try {
    const schema = buildSchema(args.config, prefix, dialect)
    const migrator = new Migrator({
      dialect,
      runner: connection.runner,
      schema,
      table: migrationsTableName(prefix),
      dir: resolve(args.cwd, options.migrationDir ?? DEFAULT_MIGRATION_DIR),
      logger: args.logger,
      interactive: args.interactive ?? false,
    })
    if (args.schema === 'push') await migrator.push()
    else if (args.schema === 'verify') await migrator.verify()
    return new DrizzleDatabase(dialect, connection, schema, migrator)
  } catch (error) {
    await connection.close().catch(() => {})
    throw error
  }
}

class DrizzleDatabase implements Database {
  private readonly builders = new Map<string, WhereBuilder>()
  private readonly db: DrizzleDb

  constructor(
    private readonly dialect: Dialect,
    private readonly connection: Connection,
    private readonly schema: SchemaModel,
    private readonly migrator: Migrator,
  ) {
    this.db = connection.db
    for (const [slug, model] of schema.collections) {
      this.builders.set(
        slug,
        new WhereBuilder(this.db, dialect, model.config.drafts === true, schema.localization),
      )
    }
  }

  private model(slug: string): CollectionModel {
    const model = this.schema.collections.get(slug)
    if (!model) throw new QueryError(`Unknown collection "${slug}"`)
    return model
  }

  private builder(slug: string): WhereBuilder {
    return this.builders.get(slug) as WhereBuilder
  }

  private where(slug: string, where: Where | undefined) {
    return this.builder(slug).build(this.model(slug).root, where)
  }

  private async load(
    model: CollectionModel,
    rows: Record<string, unknown>[],
  ): Promise<RawDocument[]> {
    const docs = await hydrate(this.db, model.root, rows)
    return rows.map((row, i) => toDocument(row, docs[i] ?? {}, model.config.drafts === true))
  }

  async find(args: FindArgs): Promise<PaginatedDocs<RawDocument>> {
    const model = this.model(args.collection)
    const condition = this.where(args.collection, args.where)
    const orderBy = this.builder(args.collection).orderBy(model.root, args.sort)

    let query = this.db
      .select()
      .from(model.root.table)
      .where(condition)
      .orderBy(...orderBy)
      .$dynamic()
    if (args.limit > 0) query = query.limit(args.limit).offset((args.page - 1) * args.limit)
    const rows = (await query) as Record<string, unknown>[]

    const totalDocs =
      args.limit > 0 && (args.page > 1 || rows.length === args.limit)
        ? await this.count({ collection: args.collection, where: args.where })
        : (args.page - 1) * args.limit + rows.length
    const totalPages = args.limit > 0 ? Math.max(1, Math.ceil(totalDocs / args.limit)) : 1

    return {
      docs: await this.load(model, rows),
      totalDocs,
      limit: args.limit,
      page: args.page,
      totalPages,
      hasNextPage: args.page < totalPages,
      hasPrevPage: args.page > 1,
    }
  }

  async findById(args: { collection: string; id: ID }): Promise<RawDocument | null> {
    const [doc] = await this.findByIds({ collection: args.collection, ids: [args.id] })
    return doc ?? null
  }

  async findByIds(args: { collection: string; ids: readonly ID[] }): Promise<RawDocument[]> {
    if (args.ids.length === 0) return []
    const model = this.model(args.collection)
    const rows = (await this.db
      .select()
      .from(model.root.table)
      .where(inArray(model.root.table.id as AnyColumn, [...args.ids]))) as Record<string, unknown>[]
    return this.load(model, rows)
  }

  async count(args: { collection: string; where?: Where | undefined }): Promise<number> {
    const model = this.model(args.collection)
    const [row] = await this.db
      .select({ total: count() })
      .from(model.root.table)
      .where(this.where(args.collection, args.where))
    return Number(row?.total ?? 0)
  }

  /**
   * Runs a write; with a single-writer database, after the writes before it in this process are
   * done. (Other processes are waited for by the database's busy timeout.)
   */
  private write<T>(run: () => Promise<T>): Promise<T> {
    if (!this.dialect.singleWriter) return run()
    const key = this.connection.writeQueue ?? ''
    const result = (writeQueues.get(key) ?? Promise.resolve()).then(run)
    const settled = result.then(
      () => {},
      () => {},
    )
    writeQueues.set(key, settled)
    // Forget the queue once it is idle, so closed databases don't stay in the map.
    void settled.then(() => {
      if (writeQueues.get(key) === settled) writeQueues.delete(key)
    })
    return result
  }

  async create(args: { collection: string; data: Record<string, unknown> }): Promise<RawDocument> {
    const model = this.model(args.collection)
    const id = await this.write<ID>(() =>
      this.db.transaction((tx: DrizzleDb) =>
        insertDocument(tx, model.root, args.data, model.config.drafts === true),
      ),
    )
    return (await this.findById({ collection: args.collection, id })) as RawDocument
  }

  async update(args: {
    collection: string
    id: ID
    data: Record<string, unknown>
  }): Promise<RawDocument> {
    const model = this.model(args.collection)
    await this.write(() =>
      this.db.transaction((tx: DrizzleDb) =>
        replaceDocument(tx, model.root, args.id, args.data, model.config.drafts === true),
      ),
    )
    return (await this.findById({ collection: args.collection, id: args.id })) as RawDocument
  }

  async delete(args: { collection: string; id: ID }): Promise<void> {
    const model = this.model(args.collection)
    await this.write(() =>
      this.db.transaction((tx: DrizzleDb) => deleteDocument(tx, model.root, args.id)),
    )
  }

  async findGlobal(args: { slug: string }): Promise<Record<string, unknown> | null> {
    const table = this.schema.globals
    const [row] = await this.db
      .select()
      .from(table)
      .where(eq(table.slug as AnyColumn, args.slug))
    if (!row) return null
    return {
      ...(row.data as Record<string, unknown>),
      ...(row.status ? { status: row.status } : {}),
      updatedAt: row.updated_at,
    }
  }

  async updateGlobal(args: {
    slug: string
    data: Record<string, unknown>
  }): Promise<Record<string, unknown>> {
    const { status, updatedAt, ...data } = args.data
    const table = this.schema.globals
    const values = {
      slug: args.slug,
      data,
      status: (status as string | undefined) ?? null,
      updated_at: updatedAt,
    }
    await this.write(() =>
      this.db
        .insert(table)
        .values(values)
        .onConflictDoUpdate({ target: table.slug as AnyColumn, set: values }),
    )
    return (await this.findGlobal({ slug: args.slug })) as Record<string, unknown>
  }

  createMigration(args: { name: string }) {
    return this.migrator.create(args.name)
  }

  migrate() {
    return this.migrator.migrate()
  }

  migrationStatus() {
    return this.migrator.status()
  }

  get backup(): ((file: string) => Promise<void>) | undefined {
    const { backupSQL } = this.dialect
    if (!backupSQL) return undefined
    // Queued with writes, so the copy is a consistent point between them.
    return (file) =>
      this.write(async () => {
        await this.connection.runner.query(backupSQL(file))
      })
  }

  get transfer(): DatabaseTransfer {
    const { tables, hash } = this.schema
    const table = (name: string): AnyTable => {
      const found = tables[name]
      if (!found) throw new QueryError(`Unknown table "${name}"`)
      return found
    }
    /** The primary key: `id` for documents and rows, `slug` for globals. */
    const key = (t: AnyTable) => {
      const columns = getTableColumns(t) as Record<string, AnyColumn>
      return (columns.id ?? columns.slug) as AnyColumn
    }
    return {
      schemaHash: hash,
      tables: () => Object.keys(tables),
      count: async (name) => {
        const [row] = await this.db.select({ n: count() }).from(table(name))
        return Number(row?.n ?? 0)
      },
      read: (name, offset, limit) => {
        const t = table(name)
        return this.db
          .select()
          .from(t)
          .orderBy(asc(key(t)))
          .limit(limit)
          .offset(offset)
      },
      write: async (name, rows) => {
        const t = table(name)
        // One parameter per value: stay well under SQLite's and Postgres' limits for wide tables.
        const size = Math.max(1, Math.floor(10_000 / Object.keys(getTableColumns(t)).length))
        for (let i = 0; i < rows.length; i += size) {
          const batch = rows.slice(i, i + size) as Record<string, unknown>[]
          await this.write(() => this.db.insert(t).values(batch))
        }
      },
      finish: async () => {
        const { resetSequenceSQL } = this.dialect
        if (!resetSequenceSQL) return
        for (const t of Object.values(tables)) {
          const id = (getTableColumns(t) as Record<string, AnyColumn>).id
          // Serial ids (numbers); array rows have text ids.
          if (id?.dataType === 'number')
            await this.connection.runner.query(resetSequenceSQL(getTableName(t), 'id'))
        }
      },
    }
  }

  async destroy(): Promise<void> {
    await this.connection.close()
  }
}
