import knex, { Knex } from 'knex';
import { config } from './environment';
import { logger } from './logger';
import './loadEnv'; // Cargar variables de entorno al inicio

export class Database {
  private static instance: Database;
  private connection: Knex;

  private constructor() {
    this.connection = this.createConnection();
  }

  private createConnection(): Knex {
    return knex({
      client: 'pg',
      connection: {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        ssl: config.database.ssl 
          ? { 
              rejectUnauthorized: false // Azure Database for PostgreSQL requiere esto
            } 
          : false,
      },
      pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 60000, // Aumentado a 60 segundos
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 600000, // Aumentado a 10 minutos para evitar cierres prematuros de Azure
        reapIntervalMillis: 10000, // Verificar conexiones idle cada 10 segundos
        createRetryIntervalMillis: 200,
      },
      // Agregar manejo de errores a nivel de pool
      asyncStackTraces: true,
      debug: false, // Desactivado para no loguear queries
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
    id: string | number,
    columns: string[] = ['*']
  ): Promise<T | null> {
    const result = await this.connection(table)
      .select(columns)
      .where('id', id)
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
    id: string | number,
    data: Partial<T>
  ): Promise<T | null> {
    const [result] = await this.connection(table)
      .where('id', id)
      .update(data)
      .returning('*');
    return result || null;
  }

  public async delete(
    table: string,
    id: string | number
  ): Promise<boolean> {
    const result = await this.connection(table)
      .where('id', id)
      .del();
    return result > 0;
  }

  public async softDelete(
    table: string,
    id: string | number
  ): Promise<boolean> {
    const result = await this.connection(table)
      .where('id', id)
      .update({
        is_active: false,
        modification_date: new Date()
      });
    return result > 0;
  }
}

export default Database;
