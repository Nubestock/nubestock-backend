import { Request } from 'express';

// ========== BASE TYPES ==========

export interface BaseEntity {
  id: number;
  is_active: boolean;
  creation_date: Date;
  modification_date?: Date;
}

// ========== USER TYPES ==========

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

// ========== PRODUCT TYPES ==========

export interface Category extends BaseEntity {
  name: string;
  idpcategory?: number; // Parent category ID
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
  abbreviation?: string;
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
  price: number; // Precio del producto (numeric 15,2) - obligatorio
}

// Receta
export interface Receipe extends BaseEntity {
  id_product: number; // Solo Producto Final (type='PF')
}

export interface ProductReceipe extends BaseEntity {
  id_receipe: number;
  id_product: number; // Solo Materia Prima (type='MP')
}

// ========== TRANSACTION TYPES ==========

export interface Transaction extends BaseEntity {
  id_product: number;
  id_user: number;
  quantity: number;
  type: 'IN' | 'OUT' | 'SAL' | 'PROD'; // IN=Ingreso, OUT=Salida no comercial, SAL=Venta, PROD=Producción
  direction: '+' | '-';
}

// ========== SALES TYPES ==========

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

// ========== ALERT TYPES ==========

export interface Alert extends BaseEntity {
  alert_type: string;
  alert_title: string;
  alert_message: string;
  entity_type: string;
  entity_id?: string;
  priority: 'high' | 'medium' | 'low';
  due_date?: Date;
  resolved_at?: Date;
  resolved_by: number;
}

// ========== MACHINERY TYPES ==========

export interface Machinery extends BaseEntity {
  name: string;
  description: string;
}

export interface Maintenance extends BaseEntity {
  id_machinery: number;
  name: string;
  type: 'PRV' | 'COR'; // PRV = Preventivo, COR = Correctivo
  next_maintainance_value?: number | null; // Días desde el último mantenimiento
  last_mantainance_date: Date;
}

export interface MaintenanceHistory extends BaseEntity {
  id_mantainance: number;
  id_user: number;
  details: string; // JSON string con attachments
  price: number;
  next_mantainance_date?: Date | null;
}

export interface MaintenanceAttachment {
  id: number;
  content: string; // Base64 o URL
}

export interface MaintenanceDetails {
  attachments: MaintenanceAttachment[];
}

export interface MachineryAlert extends BaseEntity {
  id_mantainance: number;
  type: string; // Tipo de alerta (ej. 'MAINTENANCE_DUE')
  date: Date;
  title: string;
  message: string;
  is_sent: boolean;
}

export interface AlertUser extends BaseEntity {
  id_machinery_alert: number;
  id_user: number;
  is_read: boolean;
  read_date?: Date | null;
}

export interface UserDevice extends BaseEntity {
  id_user: number;
  device_token: string;
  platform: 'ios' | 'android' | 'web';
  is_active: boolean;
}

// ========== LOCATION TYPES ==========

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

// Interfaces para la estructura jerárquica de locations
export interface CityNode {
  id: number;
  name: string;
  is_code?: string;
}

export interface ProvinceNode {
  id: number;
  name: string;
  is_code?: string;
  cities: CityNode[];
}

export interface CountryNode {
  id: number;
  name: string;
  is_code: string;
  provinces: ProvinceNode[];
}

// ========== API RESPONSE TYPES ==========

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

// ========== AUTHENTICATION TYPES ==========

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

export interface AuthenticatedRequest {
  userId: string;
  userEmail: string;
  userRole?: string;
  roles?: string[];
  rolesDetails?: Array<{ idrole: string; namerole: string; description?: string }>;
  permissions?: string[];
}

export interface AuthRequest extends Request {
  user?: User;
  token?: string;
}

// ========== VALIDATION TYPES ==========

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// ========== QUERY FILTER TYPES ==========

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

// ========== STATISTICS TYPES ==========

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

export interface StatsResponse {
  success: boolean;
  data?: {
    production?: ProductionStats;
    sales?: SalesStats;
    inventory?: InventoryStats;
  };
  message?: string;
  timestamp: string;
}

// Detailed stats response for stats endpoint
export interface DetailedStatsResponse {
  products: {
    total: number;
    active: number;
    inactive: number;
    lowStock: number;
    totalInventoryValue: number;
  };
  categories: {
    total: number;
    active: number;
    inactive: number;
  };
  sales: {
    total: number;
    active: number;
    cancelled: number;
    byStatus: {
      pending: number;
      paid: number;
      overdue: number;
      cancelled: number;
    };
    totalValue: number;
    paidValue: number;
    pendingValue: number;
    overdueValue: number;
    thisMonth: {
      count: number;
      value: number;
    };
    thisYear: {
      count: number;
      value: number;
    };
    byWeek: Array<{
      week: number;
      week_label: string;
      count: number;
      value: number;
    }>;
  };
  clients: {
    total: number;
    active: number;
    inactive: number;
    withCredit: number;
    totalCreditLimit: number;
  };
  production: {
    total: number;
    thisMonth: number;
    thisYear: number;
    daily: Array<{
      date: string;
      day_label: string;
      production: number;
      waste: number;
    }>;
  };
  alerts: {
    total: number;
    active: number;
    byPriority: {
      low: number;
      medium: number;
      high: number;
    };
    byType: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  transactions: {
    total: number;
    thisMonth: number;
    recent: Array<{
      id: number;
      product_name: string;
      product_sku: string;
      user_name: string;
      quantity: number;
      type: 'IN' | 'OUT' | 'SAL' | 'PROD';
      direction: '+' | '-';
      creation_date: string;
      has_waste?: boolean;
      waste_quantity?: number;
    }>;
  };
}

// ========== ALERT CONFIGURATION TYPES ==========

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

// ========== NOTIFICATION TYPES ==========

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

// ========== EMAIL TYPES ==========

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// ========== CONFIGURATION TYPES ==========

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
  notificationHubEnabled: boolean;
  notificationHubConnectionString: string;
  notificationHubName: string;
  notificationHubInternalKey: string;
}
