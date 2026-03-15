// Tipos base del sistema
export interface BaseEntity {
  id: number;
  is_active: boolean;
  creation_date: Date;
  modification_date?: Date;
}

// Tipos de usuario
export interface User extends BaseEntity {
  name: string;
  email: string;
  pwd_hash: string;
  phone: string;
  last_login: Date;
}

export interface UserRole extends BaseEntity {
  id_user: number;
  id_role: number;
  assigned_by: number;
  assignment_reason: string;
}

export interface Role extends BaseEntity {
  name: string;
  description: string;
}

export interface Permission extends BaseEntity {
  name: string;
  description: string;
  resource: string;
  action: string;
}

export interface RolePermission extends BaseEntity {
  id_role: number;
  id_permission: number;
}

// Tipos de productos
export interface Category extends BaseEntity {
  name: string;
}

export interface Origin extends BaseEntity {
  id_city: number;
  name: string;
  id_facility: string;
  // Optional: populated location info when using JOIN
  province_name?: string;
  city_name?: string;
  country_name?: string;
  country_code?: string;
  full_location?: string;
}

export interface Measure extends BaseEntity {
  name: string;
  description: string;
}

// Product unifica Material y FinalProduct
export interface Product extends BaseEntity {
  id_category: number;
  id_origin: number;
  id_measure: number;
  name: string;
  sku: string;
  type: 'MP' | 'PF'; // MP = Materia Prima, PF = Producto Final
  min_stock: number;
  quantity: number;
}

// Receta
export interface Receipe extends BaseEntity {
  id_product: number; // Solo Producto Final (type='PF')
}

export interface ProductReceipe extends BaseEntity {
  id_receipe: number;
  id_product: number; // Solo Materia Prima (type='MP')
}

// Tipos de operaciones
export interface Transaction extends BaseEntity {
  id_product: number;
  id_user: number;
  quantity: number;
  type: 'IN' | 'OUT' | 'SAL' | 'PROD'; // IN=Ingreso, OUT=Salida no comercial, SAL=Venta, PROD=Producción
  direction: '+' | '-';
}

// Tipos de ventas
export interface Client extends BaseEntity {
  id_city: number;
  id_province: number;
  name: string;
  identification: string;
  identification_type: 'CED' | 'RUC';
  email: string;
  phone: string;
  address: string;
  requires_credit: boolean;
  credit_limit?: number;
  credit_days: number;
}

export interface Sale extends BaseEntity {
  id_client: number;
  id_user: number;
  sale_date?: Date;
  total_amount: number;
  status: string; // 'pending' por defecto
  method: 'cash' | 'card' | 'credit' | 'transfer' | 'check' | 'other';
  due_date: Date;
  dispatch_guide: string;
  notes?: string;
}

export interface SalesDetail extends BaseEntity {
  id_sales: number;
  id_transaction: number;
}

// Tipos de alertas
export interface Alert extends BaseEntity {
  alert_type: string;
  alert_title: string;
  alert_message: string;
  entity_type: string;
  priority: 'high' | 'medium' | 'low';
  due_date?: Date;
  resolved_at?: Date;
  resolved_by: number;
}

// Tipos de maquinaria
export interface Machinery extends BaseEntity {
  name: string;
  type: string;
  maintenance_type: string;
  last_maintenance_value?: number;
  next_maintenance_value?: number;
  maintenance_unit?: string;
  maintenance_interval_value?: number;
  alert_before_value: number;
}

// Tipos de ubicaciones
export interface Country extends BaseEntity {
  name: string;
  is_code: string;
}

export interface Province extends BaseEntity {
  id_country: number;
  name: string;
  is_code: string;
}

export interface City extends BaseEntity {
  id_province: number;
  name: string;
  is_code: string;
}

// Tipos de respuesta de API
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Tipos de autenticación
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'pwd_hash'>;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone: string;
}

// Tipos de filtros y consultas
export interface QueryFilters {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

export interface ProductionFilters extends QueryFilters {
  startDate?: Date;
  endDate?: Date;
  id_user?: number;
  id_product?: number;
}

export interface SalesFilters extends QueryFilters {
  startDate?: Date;
  endDate?: Date;
  id_client?: number;
  status?: string;
}

export interface InventoryFilters extends QueryFilters {
  type?: 'MP' | 'PF';
  id_origin?: number;
  low_stock?: boolean;
}

// Tipos de estadísticas
export interface ProductionStats {
  total_produced: number;
  products_count: number;
  users_count: number;
  date_range: {
    start: Date;
    end: Date;
  };
}

export interface SalesStats {
  total_sales: number;
  total_amount: number;
  clients_count: number;
  average_sale: number;
  date_range: {
    start: Date;
    end: Date;
  };
}

export interface InventoryStats {
  total_materials: number;
  low_stock_count: number;
  total_value: number;
  by_type: Record<string, number>;
}

// Tipos de alertas automáticas
export interface AlertConfig {
  lowStockThreshold: number;
  maintenanceAlertDays: number;
  paymentOverdueDays: number;
}

export interface AlertData {
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  entity_type?: string;
  entity_id?: string;
  due_date?: Date;
}

// Tipos de notificaciones push
export interface PushNotification {
  title: string;
  body: string;
  data?: any;
  tokens: string[];
  platform: 'ios' | 'android' | 'both';
}

export interface NotificationResult {
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}

// Tipos de middleware
export interface AuthRequest extends Request {
  user?: User;
  token?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// Tipos de configuración
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  ssl: boolean;
  schema: string;
}

export interface JWTConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface NotificationConfig {
  fcmServerKey: string;
  apnsKeyId: string;
  apnsTeamId: string;
  apnsKeyPath: string;
}
