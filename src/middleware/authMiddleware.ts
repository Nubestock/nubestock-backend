import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { AuthenticatedRequest } from '../interfaces';

export const authenticateToken = (req: any): AuthenticatedRequest | null => {
  try {
    // Azure Functions puede tener headers en diferentes casos
    // Buscar el header en diferentes variantes (case-insensitive)
    const headers = req.headers || {};
    const authHeaderKey = Object.keys(headers).find(
      key => key.toLowerCase() === 'authorization'
    );
    const authHeader = authHeaderKey ? headers[authHeaderKey] : null;
    
    if (!authHeader) {
      console.error('No Authorization header found');
      console.error('Available headers:', Object.keys(headers));
      return null;
    }

    // Extraer el token del header "Bearer TOKEN" o solo "TOKEN"
    let token: string | null = null;
    if (typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else {
        token = authHeader;
      }
      // Limpiar espacios en blanco al inicio y final
      if (token) {
        token = token.trim();
      }
    }

    if (!token) {
      console.error('No token found in Authorization header');
      console.error('Authorization header value:', authHeader);
      return null;
    }

    // Validar formato básico del token (debe tener 3 partes separadas por puntos)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('Invalid token format: expected 3 parts separated by dots, got', tokenParts.length);
      console.error('Token length:', token.length);
      return null;
    }

    // Verificar que JWT_SECRET esté configurado
    if (!config.jwt.secret) {
      console.error('JWT_SECRET is not configured');
      console.error('JWT_SECRET from env:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
      return null;
    }


    // Verificar y decodificar el token
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    // Validar que el token tenga al menos userId
    if (!decoded.userId) {
      console.error('Token does not contain userId');
      console.error('Decoded token:', decoded);
      return null;
    }

    // El token debe tener: { userId, type: 'access', iat, exp, roles?, rolesDetails?, permissions? }
    // email, role, roles, rolesDetails y permissions son opcionales y pueden no estar en el token
    return {
      userId: decoded.userId,
      userEmail: decoded.email || decoded.userEmail || '', // Opcional, puede estar vacío
      userRole: decoded.role, // Opcional (legacy)
      roles: decoded.roles || [], // Array de nombres de roles del usuario
      rolesDetails: decoded.rolesDetails || [], // Array completo de información de roles (idrole, namerole, description)
      permissions: decoded.permissions || [] // Array de permisos del usuario
    };
  } catch (error: any) {
    // Log detallado del error para debugging
    if (error.name === 'TokenExpiredError') {
      console.error('Token expired:', error.expiredAt);
    } else if (error.name === 'JsonWebTokenError') {
      console.error('Invalid token:', error.message);
      console.error('JWT_SECRET configured:', !!config.jwt.secret);
    } else if (error.name === 'NotBeforeError') {
      console.error('Token not active yet:', error.date);
    } else {
      console.error('Token verification error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message
      });
    }
    return null;
  }
};

export const requireAuth = (req: any): { success: boolean; user?: AuthenticatedRequest; error?: string } => {
  const user = authenticateToken(req);
  
  if (!user) {
    return {
      success: false,
      error: 'Token inválido o expirado'
    };
  }

  return {
    success: true,
    user
  };
};

/**
 * Verifica si el usuario tiene un permiso específico
 * Si el usuario tiene el permiso "admin", automáticamente tiene acceso a todo
 */
export const hasPermission = (user: AuthenticatedRequest, permission: string): boolean => {
  if (!user.permissions || user.permissions.length === 0) {
    return false;
  }
  
  // Si el usuario tiene el permiso "admin", tiene acceso a todo
  if (user.permissions.includes('admin')) {
    return true;
  }
  
  return user.permissions.includes(permission);
};

/**
 * Verifica si el usuario tiene alguno de los permisos especificados
 * Si el usuario tiene el permiso "admin", automáticamente tiene acceso a todo
 */
export const hasAnyPermission = (user: AuthenticatedRequest, permissions: string[]): boolean => {
  if (!user.permissions || user.permissions.length === 0) {
    return false;
  }
  
  // Si el usuario tiene el permiso "admin", tiene acceso a todo
  if (user.permissions.includes('admin')) {
    return true;
  }
  
  return permissions.some(permission => user.permissions?.includes(permission));
};

/**
 * Verifica si el usuario tiene un rol específico
 */
export const hasRole = (user: AuthenticatedRequest, roleName: string): boolean => {
  if (!user.roles || user.roles.length === 0) {
    return false;
  }
  return user.roles.includes(roleName);
};

/**
 * Verifica si el usuario es administrador (tiene rol "Administrator" o permiso "admin" o "users_manage")
 */
export const isAdmin = (user: AuthenticatedRequest): boolean => {
  // Verificar por rol
  if (hasRole(user, 'Administrator') || hasRole(user, 'Admin')) {
    return true;
  }
  // Verificar por permisos comunes de admin
  return hasAnyPermission(user, ['admin', 'users_manage', 'users_write', 'admin_manage']);
};

/**
 * Requiere que el usuario tenga un permiso específico
 */
export const requirePermission = (req: any, permission: string): { success: boolean; user?: AuthenticatedRequest; error?: string } => {
  const authResult = requireAuth(req);
  
  if (!authResult.success || !authResult.user) {
    return authResult;
  }

  if (!hasPermission(authResult.user, permission)) {
    return {
      success: false,
      error: `No tienes permisos para realizar esta acción. Se requiere el permiso: ${permission}`
    };
  }

  return {
    success: true,
    user: authResult.user
  };
};

/**
 * Requiere que el usuario tenga al menos uno de los permisos especificados
 */
export const requireAnyPermission = (req: any, permissions: string[]): { success: boolean; user?: AuthenticatedRequest; error?: string } => {
  const authResult = requireAuth(req);
  
  if (!authResult.success || !authResult.user) {
    return authResult;
  }

  if (!hasAnyPermission(authResult.user, permissions)) {
    return {
      success: false,
      error: `No tienes permisos para realizar esta acción. Se requiere alguno de los siguientes permisos: ${permissions.join(', ')}`
    };
  }

  return {
    success: true,
    user: authResult.user
  };
};

/**
 * Requiere que el usuario sea administrador
 */
export const requireAdmin = (req: any): { success: boolean; user?: AuthenticatedRequest; error?: string } => {
  const authResult = requireAuth(req);
  
  if (!authResult.success || !authResult.user) {
    return authResult;
  }

  if (!isAdmin(authResult.user)) {
    return {
      success: false,
      error: 'Se requieren permisos de administrador para realizar esta acción'
    };
  }

  return {
    success: true,
    user: authResult.user
  };
};
