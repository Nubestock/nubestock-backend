// Cargar variables de entorno ANTES de crear el objeto config
import './loadEnv';

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
    port: Number.parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'password',
    name: process.env.DATABASE_NAME || 'nubestock',
    ssl: process.env.DB_SSL === 'true',
    schema: 'nubestock',
  },

  // Configuración de JWT
  jwt: {
    get secret() {
      // Evaluar lazy para asegurar que JWT_SECRET se haya cargado desde loadEnv
      return process.env.JWT_SECRET || '';
    },
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
    notificationHubEnabled: process.env.NOTIFICATION_HUB_ENABLED === 'true',
    notificationHubConnectionString: process.env.NOTIFICATION_HUB_CONNECTION_STRING || '',
    notificationHubName: process.env.NOTIFICATION_HUB_NAME || '',
    notificationHubInternalKey: process.env.NOTIFICATION_HUB_INTERNAL_KEY || '',
  },

  // Configuración de alertas
  alerts: {
    lowStockThreshold: Number.parseFloat(process.env.LOW_STOCK_THRESHOLD || '10'),
    maintenanceAlertDays: Number.parseInt(process.env.MAINTENANCE_ALERT_DAYS || '15'),
    paymentOverdueDays: Number.parseInt(process.env.PAYMENT_OVERDUE_DAYS || '30'),
  },

  // Configuración de logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'json',
    file: process.env.LOG_FILE || 'logs/app.log',
  },

  // Configuración de CORS (origen exacto obligatorio si el front envía credenciales; * no vale)
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ||
      (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ['http://localhost:3000']),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },

  // Configuración de rate limiting
  rateLimit: {
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: Number.parseInt(process.env.RATE_LIMIT_MAX || '100'),
  },

  // Configuración de seguridad
  security: {
    bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS || '12'),
    maxLoginAttempts: Number.parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDuration: Number.parseInt(process.env.LOCKOUT_DURATION || '300000'),
    passwordResetTokenExpiry: Number.parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY || '3600000'),
    bootstrapKey: process.env.BOOTSTRAP_KEY || '',
    /** Clave de la App (query param ?code=). Si no se envía o no coincide, las funciones responden 401. */
    appKey: process.env.APP_KEY || '',
  },

  // Configuración de email (Azure Communication Services)
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    connectionString: process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '',
    from: process.env.EMAIL_FROM || 'DoNotReply@nubestock.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Nubestock',
  },

  // Configuración de URLs de la aplicación
  app: {
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    resetPasswordPath: process.env.RESET_PASSWORD_PATH || '/reset-password',
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
