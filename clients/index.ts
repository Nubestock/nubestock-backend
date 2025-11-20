import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth } from '../src/middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

const clientsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;
    
    logger.info('Clients function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación
    const authResult = requireAuth(req);
    if (!authResult.success) {
      context.res = {
        status: 401,
        body: {
          success: false,
          message: authResult.error || 'Usuario no autenticado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    switch (method) {
      case 'GET':
        if (action) {
          await handleGetClient(context, req, action);
        } else {
          await handleListClients(context, req);
        }
        break;
      case 'POST':
        if (action === 'bulk') {
          await handleBulkCreateClients(context, req);
        } else {
          await handleCreateClient(context, req);
        }
        break;
      case 'PUT':
        if (action) {
          await handleUpdateClient(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de cliente requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      case 'DELETE':
        if (action) {
          await handleDeleteClient(context, req, action);
        } else {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de cliente requerido',
              timestamp: new Date().toISOString(),
            },
          };
        }
        break;
      default:
        context.res = {
          status: 405,
          body: {
            success: false,
            message: 'Método no permitido',
            timestamp: new Date().toISOString(),
          },
        };
    }
  } catch (error) {
    logger.error('Error en función de clientes:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno del servidor',
        timestamp: new Date().toISOString(),
      },
    };
  }
};

async function handleListClients(context: Context, req: HttpRequest): Promise<void> {
  try {
    const { search, isactive } = req.query;

    let query = db.getConnection()
      .select(
        'c.*',
        'p.province_name',
        'ct.city_name',
        'cnt.country_name',
        'cnt.country_code',
        db.getConnection().raw(`
          CASE 
            WHEN ct.city_name IS NOT NULL AND p.province_name IS NOT NULL AND cnt.country_name IS NOT NULL 
            THEN CONCAT(ct.city_name, ', ', p.province_name, ' (', cnt.country_code, ')')
            WHEN p.province_name IS NOT NULL AND cnt.country_name IS NOT NULL 
            THEN CONCAT(p.province_name, ' (', cnt.country_code, ')')
            WHEN ct.city_name IS NOT NULL 
            THEN ct.city_name
            ELSE NULL
          END as full_location
        `)
      )
      .from('nubestock.tb_mae_client as c')
      .leftJoin('nubestock.tb_mae_province as p', 'c.idprovince', 'p.idprovince')
      .leftJoin('nubestock.tb_mae_city as ct', 'c.idcity', 'ct.idcity')
      .leftJoin('nubestock.tb_mae_country as cnt', 'p.idcountry', 'cnt.idcountry');

    if (isactive !== undefined) {
      query = query.where('c.isactive', isactive === 'true');
    }

    if (search) {
      query = query.where(function() {
        this.where('c.client_name', 'ilike', `%${search}%`)
          .orWhere('c.business_name', 'ilike', `%${search}%`)
          .orWhere('c.email', 'ilike', `%${search}%`)
          .orWhere('c.ruc_cedula', 'ilike', `%${search}%`);
      });
    }

    const clients = await query.orderBy('c.creationdate', 'desc');

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

async function handleGetClient(context: Context, req: HttpRequest, clientId: string): Promise<void> {
  try {
    const client = await db.getConnection()
      .select(
        'c.*',
        'p.province_name',
        'ct.city_name',
        'cnt.country_name',
        'cnt.country_code',
        db.getConnection().raw(`
          CASE 
            WHEN ct.city_name IS NOT NULL AND p.province_name IS NOT NULL AND cnt.country_name IS NOT NULL 
            THEN CONCAT(ct.city_name, ', ', p.province_name, ' (', cnt.country_code, ')')
            WHEN p.province_name IS NOT NULL AND cnt.country_name IS NOT NULL 
            THEN CONCAT(p.province_name, ' (', cnt.country_code, ')')
            WHEN ct.city_name IS NOT NULL 
            THEN ct.city_name
            ELSE NULL
          END as full_location
        `)
      )
      .from('nubestock.tb_mae_client as c')
      .leftJoin('nubestock.tb_mae_province as p', 'c.idprovince', 'p.idprovince')
      .leftJoin('nubestock.tb_mae_city as ct', 'c.idcity', 'ct.idcity')
      .leftJoin('nubestock.tb_mae_country as cnt', 'p.idcountry', 'cnt.idcountry')
      .where('c.idclient', clientId)
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

async function handleCreateClient(context: Context, req: HttpRequest): Promise<void> {
  try {
    const clientSchema = Joi.object({
      client_name: Joi.string().min(2).max(200).required(),
      business_name: Joi.string().min(2).max(200).optional().allow('', null),
      ruc_cedula: Joi.string().min(10).max(13).required().messages({
        'string.min': 'El RUC/Cédula debe tener mínimo 10 caracteres',
        'string.max': 'El RUC/Cédula debe tener máximo 13 caracteres',
        'any.required': 'El RUC/Cédula es requerido'
      }),
      email: Joi.string().email().max(200).required(),
      phone: Joi.string().min(7).max(20).required(),
      address: Joi.string().max(500).optional().allow('', null),
      idprovince: Joi.string().uuid().optional().allow('', null),
      idcity: Joi.string().uuid().optional().allow('', null),
      requires_credit: Joi.boolean().default(false),
      credit_limit: Joi.number().min(0).optional().allow(null),
      credit_days: Joi.number().min(0).optional().allow(null),
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

    // Verificar si el RUC/Cédula ya existe
    const existingClient = await db.getConnection()
      .select('idclient')
      .from('nubestock.tb_mae_client')
      .where('ruc_cedula', value.ruc_cedula)
      .first();

    if (existingClient) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El RUC/Cédula ya está registrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newClient = await db.create('nubestock.tb_mae_client', {
      ...value,
      isactive: true,
      creationdate: new Date(),
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

async function handleUpdateClient(context: Context, req: HttpRequest, clientId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      client_name: Joi.string().min(2).max(200).optional(),
      business_name: Joi.string().min(2).max(200).optional().allow('', null),
      ruc_cedula: Joi.string().min(10).max(13).optional().messages({
        'string.min': 'El RUC/Cédula debe tener mínimo 10 caracteres',
        'string.max': 'El RUC/Cédula debe tener máximo 13 caracteres'
      }),
      email: Joi.string().email().max(200).optional(),
      phone: Joi.string().min(7).max(20).optional(),
      address: Joi.string().max(500).optional().allow('', null),
      idprovince: Joi.string().uuid().optional().allow('', null),
      idcity: Joi.string().uuid().optional().allow('', null),
      requires_credit: Joi.boolean().optional(),
      credit_limit: Joi.number().min(0).optional().allow(null),
      credit_days: Joi.number().min(0).optional().allow(null),
      isactive: Joi.boolean().optional(),
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
    const existingClient = await db.findById('nubestock.tb_mae_client', clientId);
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

    // Verificar si el RUC/Cédula ya existe (si se está cambiando)
    if (value.ruc_cedula && value.ruc_cedula !== (existingClient as any).ruc_cedula) {
      const rucExists = await db.getConnection()
        .select('idclient')
        .from('nubestock.tb_mae_client')
        .where('ruc_cedula', value.ruc_cedula)
        .where('idclient', '!=', clientId)
        .first();

      if (rucExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El RUC/Cédula ya está registrado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedClient = await db.update('nubestock.tb_mae_client', clientId, {
      ...value,
      modificationdate: new Date(),
    });

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

async function handleDeleteClient(context: Context, req: HttpRequest, clientId: string): Promise<void> {
  try {
    const client = await db.findById('nubestock.tb_mae_client', clientId);

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

    const deleted = await db.delete('nubestock.tb_mae_client', clientId);

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

async function handleBulkCreateClients(context: Context, req: HttpRequest): Promise<void> {
  try {
    const clientSchema = Joi.object({
      client_name: Joi.string().min(2).max(200).required(),
      business_name: Joi.string().min(2).max(200).optional().allow('', null),
      ruc_cedula: Joi.string().min(10).max(13).required().messages({
        'string.min': 'El RUC/Cédula debe tener mínimo 10 caracteres',
        'string.max': 'El RUC/Cédula debe tener máximo 13 caracteres',
        'any.required': 'El RUC/Cédula es requerido'
      }),
      email: Joi.string().email().max(200).required(),
      phone: Joi.string().min(7).max(20).required(),
      address: Joi.string().max(500).optional().allow('', null),
      idprovince: Joi.string().uuid().optional().allow('', null),
      idcity: Joi.string().uuid().optional().allow('', null),
      requires_credit: Joi.boolean().default(false),
      credit_limit: Joi.number().min(0).optional().allow(null),
      credit_days: Joi.number().min(0).optional().allow(null),
      isactive: Joi.boolean().optional(),
    });

    const clients = req.body as any[];
    
    if (!Array.isArray(clients) || clients.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'Se requiere un array de clientes',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    if (clients.length > 1000) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El número máximo de clientes por carga es 1000',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Validar y procesar clientes
    const validClients: any[] = [];
    const duplicateRucs: number[] = [];
    const rucSet = new Set<string>();
    const validationErrors: Array<{ index: number; error: string }> = [];

    // Verificar duplicados dentro del batch
    clients.forEach((client, index) => {
      const { error, value } = clientSchema.validate(client);
      if (error) {
        validationErrors.push({
          index,
          error: `Validación: ${error.details.map(d => d.message).join(', ')}`
        });
        return;
      }
      
      if (rucSet.has(value.ruc_cedula)) {
        duplicateRucs.push(index);
        validationErrors.push({
          index,
          error: 'RUC/Cédula duplicado en el batch'
        });
        return;
      }
      
      rucSet.add(value.ruc_cedula);
      validClients.push({ ...value, originalIndex: index });
    });

    // Si no hay clientes válidos, retornar errores detallados
    if (validClients.length === 0) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'No hay clientes válidos para procesar',
          data: {
            total: clients.length,
            created: 0,
            updated: 0,
            failed: clients.length,
            errors: validationErrors.map(ve => ({
              index: ve.index + 1,
              ruc_cedula: clients[ve.index]?.ruc_cedula || 'N/A',
              client_name: clients[ve.index]?.client_name || 'N/A',
              error: ve.error
            }))
          },
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const results = {
      total: clients.length,
      successful: [] as Array<{ index: number; client: any }>,
      updated: [] as Array<{ index: number; client: any }>,
      failed: [] as Array<{ index: number; client: any; error: string }>,
    };

    const now = new Date();

    try {
      await db.getConnection().transaction(async (trx) => {
        try {
          // SELECT: Obtener todos los RUCs y emails existentes
          const rucs = validClients.map(c => c.ruc_cedula);
          const emails = validClients.map(c => c.email).filter(e => e);
          
          const existingClients = await trx('nubestock.tb_mae_client')
            .select('idclient', 'ruc_cedula', 'email')
            .where((builder: any) => {
              if (rucs.length > 0) {
                builder.whereIn('ruc_cedula', rucs);
              }
              if (emails.length > 0) {
                builder.orWhereIn('email', emails);
              }
            });

          const existingRucMap = new Map(
            existingClients.map((c: any) => [c.ruc_cedula, { id: c.idclient, email: c.email }])
          );
          const existingEmailMap = new Map(
            existingClients.map((c: any) => [c.email, { id: c.idclient, ruc_cedula: c.ruc_cedula }])
          );

          // Separar clientes nuevos y existentes
          const clientsToInsert: any[] = [];
          const clientsToUpdate: Array<{ id: string; data: any; index: number; client: any }> = [];

          validClients.forEach((client) => {
            // Extraer originalIndex antes de usar el cliente
            const { originalIndex, ...clientData } = client;
            
            // Verificar primero por RUC, luego por email
            const existingByRuc = existingRucMap.get(clientData.ruc_cedula);
            const existingByEmail = clientData.email ? existingEmailMap.get(clientData.email) : null;
            
            let existingId: string | undefined;
            
            if (existingByRuc) {
              // Si existe por RUC, usar ese ID
              existingId = existingByRuc.id;
            } else if (existingByEmail) {
              // Si no existe por RUC pero sí por email, usar ese ID
              existingId = existingByEmail.id;
            }
            
            if (existingId) {
              clientsToUpdate.push({
                id: existingId,
                data: {
                  ...clientData,
                  modificationdate: now,
                },
                index: originalIndex,
                client: clientData
              });
            } else {
              clientsToInsert.push({
                ...clientData,
                isactive: clientData.isactive !== undefined ? clientData.isactive : true,
                creationdate: now,
                originalIndex: originalIndex, // Guardar temporalmente para tracking
              });
            }
          });

          // INSERT: Insertar nuevos clientes en batch
          if (clientsToInsert.length > 0) {
            try {
              // Remover originalIndex antes de insertar (es solo para tracking, no es un campo de la BD)
              const clientsToInsertClean = clientsToInsert.map(({ originalIndex, ...client }) => client);
              
              const insertedClients = await trx('nubestock.tb_mae_client')
                .insert(clientsToInsertClean)
                .returning('*');

              insertedClients.forEach((inserted: any) => {
                const originalClient = clientsToInsert.find(c => c.ruc_cedula === inserted.ruc_cedula);
                if (originalClient && originalClient.originalIndex !== undefined) {
                  results.successful.push({
                    index: originalClient.originalIndex,
                    client: inserted
                  });
                }
              });
            } catch (insertError) {
              logger.error('INSERT Error: Error al insertar clientes:', insertError);
              clientsToInsert.forEach((client) => {
                results.failed.push({
                  index: client.originalIndex,
                  client: client,
                  error: `INSERT Error: ${insertError instanceof Error ? insertError.message : 'Error desconocido'}`
                });
              });
            }
          }

          // UPDATE: Actualizar clientes existentes en paralelo
          if (clientsToUpdate.length > 0) {
            try {
              await Promise.all(
                clientsToUpdate.map(async ({ id, data, index, client }) => {
                  try {
                    await trx('nubestock.tb_mae_client')
                      .where('idclient', id)
                      .update(data);
                    
                    results.updated.push({ index, client });
                  } catch (updateError) {
                    logger.error(`UPDATE Error: Error al actualizar cliente ${id}:`, updateError);
                    results.failed.push({
                      index,
                      client,
                      error: `UPDATE Error: ${updateError instanceof Error ? updateError.message : 'Error desconocido'}`
                    });
                  }
                })
              );
            } catch (updateError) {
              logger.error('UPDATE Error: Error en actualizaciones de clientes:', updateError);
            }
          }
        } catch (selectError) {
          logger.error('SELECT Error: Error al consultar clientes existentes:', selectError);
          validClients.forEach((client) => {
            results.failed.push({
              index: client.originalIndex,
              client: client,
              error: `SELECT Error: ${selectError instanceof Error ? selectError.message : 'Error desconocido'}`
            });
          });
        }
      });
    } catch (transactionError) {
      logger.error('TRANSACTION Error: Error en transacción de carga masiva:', transactionError);
      const errorMessage = transactionError instanceof Error 
        ? transactionError.message 
        : 'Error desconocido en la transacción';
      
      let errorType = 'TRANSACTION Error';
      if (errorMessage.includes('INSERT') || errorMessage.includes('insert')) {
        errorType = 'INSERT Error';
      } else if (errorMessage.includes('UPDATE') || errorMessage.includes('update')) {
        errorType = 'UPDATE Error';
      } else if (errorMessage.includes('SELECT') || errorMessage.includes('select')) {
        errorType = 'SELECT Error';
      }
      
      validClients.forEach((client) => {
        const alreadyProcessed = results.successful.some(r => r.index === client.originalIndex) ||
                                 results.updated.some(r => r.index === client.originalIndex);
        
        if (!alreadyProcessed) {
          results.failed.push({
            index: client.originalIndex,
            client: client,
            error: `${errorType}: ${errorMessage}`,
          });
        }
      });
    }

    // Agregar errores de validación y duplicados
    clients.forEach((client, index) => {
      const { error } = clientSchema.validate(client);
      if (error) {
        results.failed.push({
          index,
          client: client,
          error: `Validación: ${error.details.map(d => d.message).join(', ')}`
        });
      } else if (duplicateRucs.includes(index)) {
        results.failed.push({
          index,
          client: client,
          error: 'RUC/Cédula duplicado en el batch'
        });
      }
    });

    // Preparar respuesta
    const totalProcessed = results.successful.length + results.updated.length;
    const responseBody: any = {
      success: results.failed.length === 0,
      message: `Procesados ${results.total} cliente(s): ${results.successful.length} creado(s), ${results.updated.length} actualizado(s), ${results.failed.length} fallido(s)`,
      data: {
        total: results.total,
        created: results.successful.length,
        updated: results.updated.length,
        failed: results.failed.length,
        errors: results.failed.map(r => ({
          index: r.index + 1,
          ruc_cedula: r.client.ruc_cedula || 'N/A',
          client_name: r.client.client_name || 'N/A',
          error: r.error,
        })),
      },
      timestamp: new Date().toISOString(),
    };

    if (results.failed.length > 0 && totalProcessed > 0) {
      context.res = {
        status: 207,
        body: responseBody,
      };
    } else if (results.failed.length === results.total) {
      context.res = {
        status: 400,
        body: responseBody,
      };
    } else {
      context.res = {
        status: 201,
        body: responseBody,
      };
    }
  } catch (error) {
    logger.error('Error en carga masiva de clientes:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error interno al procesar carga masiva',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default clientsHandler;

