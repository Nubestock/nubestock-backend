import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../config/logger';

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationErrors: ValidationError[] = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      logger.warn('Error de validación:', {
        errors: validationErrors,
        body: req.body,
        user: (req as any).user?.iduser,
      });

      res.status(400).json({
        success: false,
        message: 'Error de validación',
        errors: validationErrors,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.body = value;
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationErrors: ValidationError[] = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      logger.warn('Error de validación de query:', {
        errors: validationErrors,
        query: req.query,
        user: (req as any).user?.iduser,
      });

      res.status(400).json({
        success: false,
        message: 'Error de validación de parámetros',
        errors: validationErrors,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.query = value;
    next();
  };
};

export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationErrors: ValidationError[] = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      logger.warn('Error de validación de parámetros:', {
        errors: validationErrors,
        params: req.params,
        user: (req as any).user?.iduser,
      });

      res.status(400).json({
        success: false,
        message: 'Error de validación de parámetros',
        errors: validationErrors,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    req.params = value;
    next();
  };
};

// Esquemas de validación comunes
export const commonSchemas = {
  // Validación de UUID
  uuid: Joi.string().uuid().required(),
  uuidOptional: Joi.string().uuid().optional(),

  // Validación de paginación
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  // Validación de fechas
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  }),

  // Validación de búsqueda
  search: Joi.object({
    search: Joi.string().min(1).max(100).optional(),
    filters: Joi.object().optional(),
  }),

  // Validación de usuario
  user: Joi.object({
    nameuser: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(100).required(),
    phone: Joi.string().min(10).max(20).optional(),
  }),

  // Validación de login
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Validación de producto
  product: Joi.object({
    product_name: Joi.string().min(2).max(200).required(),
    idcategory: Joi.string().uuid().required(),
    idorigin: Joi.string().uuid().required(),
    description: Joi.string().max(500).optional(),
    sku: Joi.string().min(2).max(100).required(),
    unit_price: Joi.number().positive().required(),
  }),

  // Validación de material
  material: Joi.object({
    material_name: Joi.string().min(2).max(200).required(),
    material_code: Joi.string().min(2).max(50).required(),
    material_type: Joi.string().valid('raw', 'packaging').required(),
    idorigin: Joi.string().uuid().required(),
    unit_of_measure: Joi.string().min(2).max(20).required(),
    cost_per_unit: Joi.number().positive().required(),
    supplier: Joi.string().max(200).optional(),
    minimum_stock: Joi.number().min(0).required(),
  }),

  // Validación de cliente
  client: Joi.object({
    client_name: Joi.string().min(2).max(200).required(),
    business_name: Joi.string().min(2).max(200).required(),
    ruc_cedula: Joi.string().min(10).max(20).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().min(10).max(20).optional(),
    address: Joi.string().max(500).optional(),
    province: Joi.string().max(100).optional(),
    city: Joi.string().max(100).optional(),
    requires_credit: Joi.boolean().default(false),
    credit_limit: Joi.number().positive().optional(),
    credit_days: Joi.number().integer().min(1).optional(),
  }),

  // Validación de venta
  sale: Joi.object({
    idclient: Joi.string().uuid().required(),
    iduser: Joi.string().uuid().optional(),
    sale_date: Joi.date().iso().required(),
    total_amount: Joi.number().positive().required(),
    payment_status: Joi.string().valid('pending', 'paid', 'overdue', 'cancelled').default('pending'),
    payment_due_date: Joi.date().iso().optional(),
    dispatch_guide: Joi.string().max(100).optional(),
    notes: Joi.string().max(500).optional(),
  }),

  // Validación de producción
  production: Joi.object({
    iduser: Joi.string().uuid().required(),
    idfinal_product: Joi.string().uuid().required(),
    production_date: Joi.date().iso().required(),
    quantity_produced: Joi.number().positive().required(),
    unit_of_measure: Joi.string().min(2).max(20).required(),
    notes: Joi.string().max(500).optional(),
  }),

  // Validación de transacción
  transaction: Joi.object({
    iduser: Joi.string().uuid().required(),
    idfinal_product: Joi.string().uuid().optional(),
    idmaterial: Joi.string().uuid().optional(),
    transaction_type: Joi.string().valid('purchase', 'production', 'sale', 'waste', 'adjustment').required(),
    quantity: Joi.number().required(),
    unit_of_measure: Joi.string().min(2).max(20).required(),
    unit_cost: Joi.number().positive().optional(),
    total_cost: Joi.number().positive().optional(),
    transaction_date: Joi.date().iso().default(Date.now),
    notes: Joi.string().max(500).optional(),
  }),

  // Validación de maquinaria
  machinery: Joi.object({
    machinery_name: Joi.string().min(2).max(200).required(),
    machinery_type: Joi.string().min(2).max(50).required(),
    maintenance_type: Joi.string().valid('time_based', 'mileage_based', 'hours_based', 'cycles_based').default('time_based'),
    last_maintenance_value: Joi.number().min(0).optional(),
    next_maintenance_value: Joi.number().min(0).optional(),
    maintenance_unit: Joi.string().max(20).optional(),
    maintenance_interval_value: Joi.number().positive().optional(),
    alert_before_value: Joi.number().min(0).default(15),
  }),

  // Validación de alerta
  alert: Joi.object({
    alert_type: Joi.string().min(2).max(50).required(),
    alert_title: Joi.string().min(2).max(200).required(),
    alert_message: Joi.string().min(2).max(1000).required(),
    entity_type: Joi.string().max(50).optional(),
    entity_id: Joi.string().uuid().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    status: Joi.string().valid('active', 'resolved', 'dismissed').default('active'),
    due_date: Joi.date().iso().optional(),
  }),
};

export default {
  validateRequest,
  validateQuery,
  validateParams,
  commonSchemas,
};
