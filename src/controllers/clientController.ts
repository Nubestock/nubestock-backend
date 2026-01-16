import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { Client } from '../interfaces';
import Joi from 'joi';

const db = Database.getInstance();

export async function listClients(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { search, is_active } = req.query;

    let query = db.getConnection()
      .select(
        'c.*',
        'p.name as province_name',
        'ct.name as city_name',
        'cnt.name as country_name',
        'cnt.is_code',
        db.getConnection().raw(`
          CASE 
            WHEN ct.name IS NOT NULL AND p.name IS NOT NULL AND cnt.name IS NOT NULL 
            THEN CONCAT(ct.name, ', ', p.name, ' (', cnt.is_code, ')')
            WHEN p.name IS NOT NULL AND cnt.name IS NOT NULL 
            THEN CONCAT(p.name, ' (', cnt.is_code, ')')
            WHEN ct.name IS NOT NULL 
            THEN ct.name
            ELSE NULL
          END as full_location
        `)
      )
      .from('nubestock.tb_mae_client as c')
      .leftJoin('nubestock.tb_mae_province as p', 'c.id_province', 'p.id')
      .leftJoin('nubestock.tb_mae_city as ct', 'c.id_city', 'ct.id')
      .leftJoin('nubestock.tb_mae_country as cnt', 'p.id_country', 'cnt.id');

    if (is_active !== undefined) {
      query = query.where('c.is_active', is_active === 'true');
    }

    if (search) {
      query = query.where(function() {
        this.where('c.name', 'ilike', `%${search}%`)
          .orWhere('c.email', 'ilike', `%${search}%`)
          .orWhere('c.identification', 'ilike', `%${search}%`);
      });
    }

    const clients = await query.orderBy('c.creation_date', 'desc');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: clients,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al listar clientes:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al listar clientes',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function getClient(context: Context, req: HttpRequest, clientId: string): Promise<void> {
  try {
    const clientIdNum = parseInt(clientId, 10);
    if (isNaN(clientIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de cliente inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const client = await db.getConnection()
      .select(
        'c.*',
        'p.name as province_name',
        'ct.name as city_name',
        'cnt.name as country_name',
        'cnt.is_code',
        db.getConnection().raw(`
          CASE 
            WHEN ct.name IS NOT NULL AND p.name IS NOT NULL AND cnt.name IS NOT NULL 
            THEN CONCAT(ct.name, ', ', p.name, ' (', cnt.is_code, ')')
            WHEN p.name IS NOT NULL AND cnt.name IS NOT NULL 
            THEN CONCAT(p.name, ' (', cnt.is_code, ')')
            WHEN ct.name IS NOT NULL 
            THEN ct.name
            ELSE NULL
          END as full_location
        `)
      )
      .from('nubestock.tb_mae_client as c')
      .leftJoin('nubestock.tb_mae_province as p', 'c.id_province', 'p.id')
      .leftJoin('nubestock.tb_mae_city as ct', 'c.id_city', 'ct.id')
      .leftJoin('nubestock.tb_mae_country as cnt', 'p.id_country', 'cnt.id')
      .where('c.id', clientIdNum)
      .first();

    if (!client) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Cliente no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: client,
        message: 'Cliente obtenido exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener cliente:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener cliente',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function createClient(context: Context, req: HttpRequest): Promise<void> {
  try {
    const clientSchema = Joi.object({
      name: Joi.string().min(2).max(200).required(),
      id_city: Joi.number().integer().required(),
      id_province: Joi.number().integer().required(),
      identification: Joi.string().min(10).max(13).required().messages({
        'string.min': 'La identificación debe tener mínimo 10 caracteres',
        'string.max': 'La identificación debe tener máximo 13 caracteres',
        'any.required': 'La identificación es requerida'
      }),
      identification_type: Joi.string().valid('CED', 'RUC').required(),
      email: Joi.string().email().max(200).required(),
      phone: Joi.string().min(7).max(20).required(),
      address: Joi.string().max(500).required(),
      requires_credit: Joi.boolean().default(false),
      credit_limit: Joi.number().min(0).optional().allow(null),
      credit_days: Joi.number().min(0).default(0),
    });

    const { error, value } = clientSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la identificación ya existe
    const existingClient = await db.getConnection()
      .select('id')
      .from('nubestock.tb_mae_client')
      .where('identification', value.identification)
      .first();

    if (existingClient) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La identificación ya está registrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newClient = await db.create('nubestock.tb_mae_client', {
      name: value.name,
      id_city: value.id_city,
      id_province: value.id_province,
      identification: value.identification,
      identification_type: value.identification_type,
      email: value.email,
      phone: value.phone,
      address: value.address,
      requires_credit: value.requires_credit || false,
      credit_limit: value.credit_limit || null,
      credit_days: value.credit_days || 0,
      is_active: true,
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newClient,
        message: 'Cliente creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear cliente:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear cliente',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function updateClient(context: Context, req: HttpRequest, clientId: string): Promise<void> {
  try {
    const clientIdNum = parseInt(clientId, 10);
    if (isNaN(clientIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de cliente inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updateSchema = Joi.object({
      name: Joi.string().min(2).max(200).optional(),
      identification: Joi.string().min(10).max(13).optional().messages({
        'string.min': 'La identificación debe tener mínimo 10 caracteres',
        'string.max': 'La identificación debe tener máximo 13 caracteres'
      }),
      identification_type: Joi.string().valid('CED', 'RUC').optional(),
      email: Joi.string().email().max(200).optional(),
      phone: Joi.string().min(7).max(20).optional(),
      address: Joi.string().max(500).optional().allow('', null),
      id_province: Joi.number().integer().optional().allow(null),
      id_city: Joi.number().integer().optional().allow(null),
      requires_credit: Joi.boolean().optional(),
      credit_limit: Joi.number().min(0).optional().allow(null),
      credit_days: Joi.number().min(0).optional().allow(null),
      is_active: Joi.boolean().optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    
    if (error) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message,
          })),
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el cliente existe
    const existingClient = await db.findById('nubestock.tb_mae_client', clientIdNum);
    if (!existingClient) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Cliente no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si la identificación ya existe (si se está cambiando)
    if (value.identification && value.identification !== (existingClient as any).identification) {
      const identificationExists = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_client')
        .where('identification', value.identification)
        .where('id', '!=', clientIdNum)
        .first();

      if (identificationExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'La identificación ya está registrada',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updateData: any = {
      modification_date: new Date(),
    };
    if (value.name !== undefined) updateData.name = value.name;
    if (value.identification !== undefined) updateData.identification = value.identification;
    if (value.identification_type !== undefined) updateData.identification_type = value.identification_type;
    if (value.email !== undefined) updateData.email = value.email;
    if (value.phone !== undefined) updateData.phone = value.phone;
    if (value.address !== undefined) updateData.address = value.address;
    if (value.id_province !== undefined) updateData.id_province = value.id_province;
    if (value.id_city !== undefined) updateData.id_city = value.id_city;
    if (value.requires_credit !== undefined) updateData.requires_credit = value.requires_credit;
    if (value.credit_limit !== undefined) updateData.credit_limit = value.credit_limit;
    if (value.credit_days !== undefined) updateData.credit_days = value.credit_days;
    if (value.is_active !== undefined) updateData.is_active = value.is_active;

    const updatedClient = await db.update('nubestock.tb_mae_client', clientIdNum, updateData);

    if (!updatedClient) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al actualizar cliente',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedClient,
        message: 'Cliente actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar cliente:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar cliente',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export async function deleteClient(context: Context, req: HttpRequest, clientId: string): Promise<void> {
  try {
    const clientIdNum = parseInt(clientId, 10);
    if (isNaN(clientIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de cliente inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const client = await db.findById('nubestock.tb_mae_client', clientIdNum);

    if (!client) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Cliente no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Soft delete: desactivar en lugar de eliminar
    const deleted = await db.update('nubestock.tb_mae_client', clientIdNum, {
      is_active: false,
      modification_date: new Date(),
    });

    if (!deleted) {
      context.res = {
        status: 500,
        body: {
          success: false,
          message: 'Error al eliminar cliente',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Cliente eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar cliente:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar cliente',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
