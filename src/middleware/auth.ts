import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { Database } from '../config/database';
import { User } from '../types';
import { logger } from '../config/logger';

export interface AuthRequest extends Request {
  user?: User;
  token?: string;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Token de acceso requerido',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Verificar el token
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    // Obtener el usuario de la base de datos
    const db = Database.getInstance();
    const user = await db.findById<User>('tb_mae_user', decoded.userId);

    if (!user || !user.isactive) {
      res.status(401).json({
        success: false,
        message: 'Usuario no válido o inactivo',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Verificar si la cuenta está bloqueada
    if (user.account_locked_until && new Date() < user.account_locked_until) {
      res.status(401).json({
        success: false,
        message: 'Cuenta bloqueada temporalmente',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    logger.error('Error en autenticación:', error);
    res.status(401).json({
      success: false,
      message: 'Token inválido',
      timestamp: new Date().toISOString(),
    });
  }
};

export const requireRole = (roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const db = Database.getInstance();
      
      // Obtener roles del usuario
      const userRoles = await db.getConnection()
        .select('r.namerole')
        .from('tb_mae_user_role as ur')
        .join('tb_mae_role as r', 'ur.idrole', 'r.idrole')
        .where('ur.iduser', req.user.iduser)
        .where('ur.isactive', true)
        .where('r.isactive', true);

      const userRoleNames = userRoles.map(role => role.namerole);
      
      // Verificar si el usuario tiene alguno de los roles requeridos
      const hasRequiredRole = roles.some(role => userRoleNames.includes(role));
      
      if (!hasRequiredRole) {
        res.status(403).json({
          success: false,
          message: 'Permisos insuficientes',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error en verificación de roles:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      });
    }
  };
};

export const requirePermission = (permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const db = Database.getInstance();
      
      // Obtener permisos del usuario a través de sus roles
      const userPermissions = await db.getConnection()
        .select('p.namepermission')
        .from('tb_mae_user_role as ur')
        .join('tb_mae_role_permission as rp', 'ur.idrole', 'rp.idrole')
        .join('tb_mae_permission as p', 'rp.idpermission', 'p.idpermission')
        .where('ur.iduser', req.user.iduser)
        .where('ur.isactive', true)
        .where('rp.isactive', true)
        .where('p.isactive', true);

      const userPermissionNames = userPermissions.map(perm => perm.namepermission);
      
      // Verificar si el usuario tiene alguno de los permisos requeridos
      const hasRequiredPermission = permissions.some(permission => 
        userPermissionNames.includes(permission)
      );
      
      if (!hasRequiredPermission) {
        res.status(403).json({
          success: false,
          message: 'Permisos insuficientes',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      next();
    } catch (error) {
      logger.error('Error en verificación de permisos:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      });
    }
  };
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        const db = Database.getInstance();
        const user = await db.findById<User>('tb_mae_user', decoded.userId);
        
        if (user && user.isactive) {
          req.user = user;
          req.token = token;
        }
      } catch (error) {
        // Token inválido, continuar sin autenticación
        logger.debug('Token inválido en autenticación opcional:', error);
      }
    }

    next();
  } catch (error) {
    logger.error('Error en autenticación opcional:', error);
    next();
  }
};

export const rateLimitByUser = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const userId = req.user?.iduser;
    
    if (!userId) {
      next();
      return;
    }

    const now = Date.now();
    const userRequests = requests.get(userId);

    if (!userRequests || now > userRequests.resetTime) {
      requests.set(userId, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (userRequests.count >= maxRequests) {
      res.status(429).json({
        success: false,
        message: 'Demasiadas solicitudes',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    userRequests.count++;
    next();
  };
};
