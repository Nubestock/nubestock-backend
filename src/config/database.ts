import knex, { Knex } from 'knex';
import { config } from './environment';

const extractTableName = (table: string): string => {
  if (!table) return table;
  const parts = table.split('.');
  return parts[parts.length - 1];
};

const getIdColumnForTable = (table: string): string => {
  const tableName = extractTableName(table);
  switch (tableName) {
    case 'tb_mae_user':
      return 'iduser';
    case 'tb_mae_role':
      return 'idrole';
    case 'tb_mae_permission':
      return 'idpermission';
    case 'tb_mae_user_role':
      return 'iduserrole';
    case 'tb_mae_role_permission':
      return 'idrolepermission';
    case 'tb_ope_availability':
      return 'idavailability';
    case 'tb_ope_transaction':
      return 'idtransaction';
    default:
      return 'id';
  }
};

export class Database {
  private static instance: Database;
  private connection: Knex;

  private constructor() {
    this.connection = knex({
      client: 'pg',
      connection: {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      },
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
      },
      migrations: {
        directory: './src/migrations',
        tableName: 'knex_migrations',
      },
      seeds: {
        directory: './src/seeds',
      },
    });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public getConnection(): Knex {
    return this.connection;
  }

  public async testConnection(): Promise<boolean> {
    try {
      await this.connection.raw('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  public async setSchema(): Promise<void> {
    try {
      await this.connection.raw(`SET search_path TO ${config.database.schema}, public`);
    } catch (error) {
      console.error('Failed to set schema:', error);
    }
  }

  public async close(): Promise<void> {
    await this.connection.destroy();
  }

  // Métodos de utilidad para transacciones
  public async transaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>
  ): Promise<T> {
    return this.connection.transaction(callback);
  }

  // Métodos de utilidad para consultas comunes
  public async findById<T>(
    table: string,
    id: string,
    columns: string[] = ['*']
  ): Promise<T | null> {
    const idColumn = getIdColumnForTable(table);
    const result = await this.connection(table)
      .select(columns)
      .where(idColumn, id)
      .first();
    return result || null;
  }

  public async findAll<T>(
    table: string,
    conditions: Record<string, any> = {},
    columns: string[] = ['*']
  ): Promise<T[]> {
    let query = this.connection(table).select(columns);
    
    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.where(key, value);
      }
    });
    
    return query;
  }

  public async create<T>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    const [result] = await this.connection(table)
      .insert(data)
      .returning('*');
    return result;
  }

  public async update<T>(
    table: string,
    id: string,
    data: Partial<T>
  ): Promise<T | null> {
    const idColumn = getIdColumnForTable(table);
    const [result] = await this.connection(table)
      .where(idColumn, id)
      .update(data)
      .returning('*');
    return result || null;
  }

  public async delete(
    table: string,
    id: string
  ): Promise<boolean> {
    const idColumn = getIdColumnForTable(table);
    const result = await this.connection(table)
      .where(idColumn, id)
      .del();
    return result > 0;
  }

  public async softDelete(
    table: string,
    id: string
  ): Promise<boolean> {
    const idColumn = getIdColumnForTable(table);
    const result = await this.connection(table)
      .where(idColumn, id)
      .update({
        isactive: false,
        modificationdate: new Date()
      });
    return result > 0;
  }
}

export default Database;
