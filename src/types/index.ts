// Tipos base del sistema
export interface BaseEntity {
  id: string;
  isactive: boolean;
  creationdate: Date;
  modificationdate?: Date;
}

// Tipos de usuario
export interface User extends BaseEntity {
  iduser: string;
  nameuser: string;
  email: string;
  passwordhash: string;
  phone?: string;
  last_login?: Date;
  failed_login_attempts: number;
  account_locked_until?: Date;
}

export interface UserRole extends BaseEntity {
  iduser: string;
  idrole: string;
  assigned_by?: string;
  assignment_reason?: string;
}

export interface Role extends BaseEntity {
  namerole: string;
  description?: string;
}

export interface Permission extends BaseEntity {
  namepermission: string;
  description?: string;
  resource: string;
  action: string;
}

export interface RolePermission extends BaseEntity {
  idrole: string;
  idpermission: string;
}

// Tipos de productos
export interface Category extends BaseEntity {
  namecategory: string;
  idpcategory: string;
}

export interface Origin extends BaseEntity {
  nameorigin: string;
  idfacility: string;
  province: string;
  city?: string;
}

export interface Material extends BaseEntity {
  material_name: string;
  material_code: string;
  material_type: 'raw' | 'packaging';
  idorigin: string;
  unit_of_measure: string;
  cost_per_unit: number;
  supplier?: string;
  minimum_stock: number;
}

export interface FinalProduct extends BaseEntity {
  product_name: string;
  idcategory: string;
  idorigin: string;
  description?: string;
  sku: string;
  unit_price: number;
}

export interface ProductRecipe extends BaseEntity {
  idfinal_product: string;
  idmaterial: string;
}

// Tipos de operaciones
export interface DailyProduction extends BaseEntity {
  iduser: string;
  idfinal_product: string;
  production_date: Date;
  quantity_produced: number;
  unit_of_measure: string;
  notes?: string;
}

export interface Transaction extends BaseEntity {
  iduser: string;
  idfinal_product?: string;
  idmaterial?: string;
  transaction_type: 'purchase' | 'production' | 'sale' | 'waste' | 'adjustment';
  quantity: number;
  unit_of_measure: string;
  unit_cost?: number;
  total_cost?: number;
  transaction_date: Date;
  notes?: string;
}

// Tipos de ventas
export interface Client extends BaseEntity {
  client_name: string;
  business_name: string;
  ruc_cedula: string;
  email: string;
  phone?: string;
  address?: string;
  province?: string;
  city?: string;
  requires_credit: boolean;
  credit_limit?: number;
  credit_days?: number;
}

export interface Sale extends BaseEntity {
  idclient: string;
  iduser?: string;
  sale_date: Date;
  total_amount: number;
  payment_status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  payment_due_date?: Date;
  dispatch_guide?: string;
  notes?: string;
}

export interface SalesDetail extends BaseEntity {
  idsale: string;
  idfinal_product: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

// Tipos de alertas
export interface Alert extends BaseEntity {
  alert_type: string;
  alert_title: string;
  alert_message: string;
  entity_type?: string;
  entity_id?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'dismissed';
  due_date?: Date;
  resolved_at?: Date;
  resolved_by?: string;
}

// Tipos de maquinaria
export interface Machinery extends BaseEntity {
  machinery_name: string;
  machinery_type: string;
  maintenance_type: 'time_based' | 'mileage_based' | 'hours_based' | 'cycles_based';
  last_maintenance_value?: number;
  next_maintenance_value?: number;
  maintenance_unit?: string;
  maintenance_interval_value?: number;
  alert_before_value?: number;
}

// Tipos de notificaciones
export interface DeviceToken extends BaseEntity {
  iduser: string;
  device_token: string;
  platform: 'ios' | 'android';
  app_version?: string;
  device_model?: string;
  last_used: Date;
}

export interface Notification extends BaseEntity {
  iduser: string;
  idalert?: string;
  notification_type: string;
  title: string;
  body: string;
  data?: any;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  sent_at?: Date;
  delivered_at?: Date;
  read_at?: Date;
}

// Tipos de logs
export interface SystemLog extends BaseEntity {
  iduser?: string;
  log_type: 'user_action' | 'system_event' | 'error' | 'security';
  action: string;
  entity: string;
  entity_id?: string;
  before_state?: any;
  after_state?: any;
  log_message?: string;
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
  user: Omit<User, 'passwordhash'>;
  token: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RegisterRequest {
  nameuser: string;
  email: string;
  password: string;
  phone?: string;
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
  iduser?: string;
  idfinal_product?: string;
}

export interface SalesFilters extends QueryFilters {
  startDate?: Date;
  endDate?: Date;
  idclient?: string;
  payment_status?: string;
}

export interface InventoryFilters extends QueryFilters {
  material_type?: string;
  idorigin?: string;
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
