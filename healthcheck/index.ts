import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { logErrorResponse } from '../src/utils/httpLogger';

const db = Database.getInstance();

const healthcheckHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  const startTime = Date.now();
  const healthStatus: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      api: {
        status: 'healthy',
        message: 'API is running'
      },
      database: {
        status: 'unknown',
        message: 'Checking database connection...'
      }
    }
  };

  try {
    // Verificar conexión a la base de datos
    try {
      await db.getConnection().raw('SELECT 1 as health');
      healthStatus.checks.database = {
        status: 'healthy',
        message: 'Database connection successful'
      };
    } catch (dbError: any) {
      logger.error('Database health check failed:', dbError);
      healthStatus.checks.database = {
        status: 'unhealthy',
        message: dbError.message || 'Database connection failed'
      };
      healthStatus.status = 'degraded';
    }

    // Verificar variables de entorno críticas
    const criticalEnvVars = [
      'DATABASE_HOSTNAME',
      'DATABASE_NAME',
      'JWT_SECRET'
    ];

    const missingEnvVars = criticalEnvVars.filter(varName => !process.env[varName]);
    
    if (missingEnvVars.length > 0) {
      healthStatus.checks.environment = {
        status: 'unhealthy',
        message: `Missing environment variables: ${missingEnvVars.join(', ')}`
      };
      healthStatus.status = 'unhealthy';
    } else {
      healthStatus.checks.environment = {
        status: 'healthy',
        message: 'All critical environment variables are set'
      };
    }

    // Calcular tiempo de respuesta
    const responseTime = Date.now() - startTime;
    healthStatus.responseTime = `${responseTime}ms`;

    // Determinar estado general
    const allChecksHealthy = Object.values(healthStatus.checks).every(
      (check: any) => check.status === 'healthy'
    );

    if (!allChecksHealthy && healthStatus.status !== 'unhealthy') {
      healthStatus.status = 'degraded';
    }

    // Código de estado HTTP basado en el estado de salud
    const httpStatus = healthStatus.status === 'healthy' 
      ? 200 
      : healthStatus.status === 'degraded' 
        ? 200 // Degraded pero aún funcional
        : 503; // Unhealthy - Service Unavailable

    context.res = {
      status: httpStatus,
      body: healthStatus,
      headers: {
        'Content-Type': 'application/json'
      }
    };
  } catch (error: any) {
    logger.error('Health check error:', error);
    (context as any).__errorLogged = true;
    
    healthStatus.status = 'unhealthy';
    healthStatus.checks.api = {
      status: 'unhealthy',
      message: error.message || 'Unknown error occurred'
    };

    context.res = {
      status: 503,
      body: healthStatus,
      headers: {
        'Content-Type': 'application/json'
      }
    };
  } finally {
    logErrorResponse(context, req, 'healthcheck');
  }
};

export default healthcheckHandler;

