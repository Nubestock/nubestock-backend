import jwt from 'jsonwebtoken';
import { config } from '../config/environment';

export interface AuthenticatedRequest {
  userId: string;
  userEmail: string;
  userRole?: string;
}

export const authenticateToken = (req: any): AuthenticatedRequest | null => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return null;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as any;
    
    return {
      userId: decoded.userId,
      userEmail: decoded.email || decoded.userEmail,
      userRole: decoded.role
    };
  } catch (error) {
    console.error('Token verification error:', error);
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
