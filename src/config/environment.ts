export const config = {
  // Configuración del servidor
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
    environment: process.env.NODE_ENV || 'development',
  },

  // Configuración de la base de datos
  database: {
    host: process.env.DATABASE_HOSTNAME || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'password',
    name: process.env.DATABASE_NAME || 'nubestock',
    ssl: process.env.DB_SSL === 'true',
    schema: 'nubestock',
  },

  // Configuración de JWT
  jwt: {
    secret: process.env.JWT_SECRET ,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Configuración de Azure Functions
  azure: {
    functionAppName: process.env.AZURE_FUNCTION_APP_NAME || 'nubestock-functions',
    storageAccount: process.env.AZURE_STORAGE_ACCOUNT || '',
    storageKey: process.env.AZURE_STORAGE_KEY || '',
  },

  // Configuración de notificaciones
  notifications: {
    fcmServerKey: process.env.FCM_SERVER_KEY || '',
    apnsKeyId: process.env.APNS_KEY_ID || '',
    apnsTeamId: process.env.APNS_TEAM_ID || '',
    apnsKeyPath: process.env.APNS_KEY_PATH || '',
  },

  // Configuración de alertas
  alerts: {
    lowStockThreshold: parseFloat(process.env.LOW_STOCK_THRESHOLD || '10'),
    maintenanceAlertDays: parseInt(process.env.MAINTENANCE_ALERT_DAYS || '15'),
    paymentOverdueDays: parseInt(process.env.PAYMENT_OVERDUE_DAYS || '30'),
  },

  // Configuración de logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || 'logs/app.log',
  },

  // Configuración de CORS
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  // Configuración de rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requests por ventana
  },

  // Configuración de seguridad
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '300000'), // 5 minutos
  },
};

// Validación de configuración requerida
export const validateConfig = (): void => {
  const requiredEnvVars = [
    'DATABASE_HOSTNAME',
    'DATABASE_USERNAME',
    'DATABASE_PASSWORD',
    'DATABASE_NAME',
    'JWT_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }
};

export default config;
