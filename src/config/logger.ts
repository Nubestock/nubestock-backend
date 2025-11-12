import winston from 'winston';
import { config } from './environment';

// Configuración de formatos
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// Configuración de transportes
const transports: winston.transport[] = [];

// Consola (solo en desarrollo)
if (config.server.environment === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    })
  );
}

// Archivo (en todos los entornos)
transports.push(
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  })
);

// Crear el logger
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Logger específico para base de datos
export const dbLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/database.log',
      maxsize: 5242880, // 5MB
      maxFiles: 3,
    }),
  ],
});

// Logger específico para auditoría
export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/audit.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
    }),
  ],
});

// Logger específico para alertas
export const alertLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'logs/alerts.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Métodos de utilidad
export const logError = (error: Error, context?: any): void => {
  logger.error('Error occurred', {
    message: error.message,
    stack: error.stack,
    context,
  });
};

export const logInfo = (message: string, meta?: any): void => {
  logger.info(message, meta);
};

export const logWarning = (message: string, meta?: any): void => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any): void => {
  logger.debug(message, meta);
};

export const logAudit = (action: string, userId: string, details: any): void => {
  auditLogger.info('Audit log', {
    action,
    userId,
    timestamp: new Date().toISOString(),
    details,
  });
};

export const logAlert = (alertType: string, message: string, data: any): void => {
  alertLogger.info('Alert generated', {
    alertType,
    message,
    timestamp: new Date().toISOString(),
    data,
  });
};

export default logger;
