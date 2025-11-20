import { AzureFunction, Context, HttpRequest } from '../src/types/azure-functions';
import { Database } from '../src/config/database';
import { logger } from '../src/config/logger';
import { requireAuth } from '../src/middleware/authMiddleware';
import Joi from 'joi';

const db = Database.getInstance();

// Interfaces para la estructura jerárquica
interface CityNode {
  idcity: string;
  city_name: string;
  city_code?: string;
}

interface ProvinceNode {
  idprovince: string;
  province_name: string;
  province_code?: string;
  cities: CityNode[];
}

interface CountryNode {
  idcountry: string;
  country_name: string;
  country_code: string;
  provinces: ProvinceNode[];
}

const locationsHandler: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
  try {
    const { action } = req.params;
    const method = req.method;

    logger.info('Locations function triggered', {
      action,
      method,
      url: req.url,
    });

    // Verificar autenticación usando el middleware
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

    // Routing basado en método y acción
    if (method === 'GET') {
      if (action === 'countries') {
        const id = req.query.id as string;
        if (id) {
          await handleGetCountryById(context, req, id);
        } else {
          await handleGetCountries(context, req);
        }
      } else if (action === 'provinces') {
        const id = req.query.id as string;
        if (id) {
          await handleGetProvinceById(context, req, id);
        } else {
          await handleGetProvinces(context, req);
        }
      } else if (action === 'cities') {
        const id = req.query.id as string;
        if (id) {
          await handleGetCityById(context, req, id);
        } else {
          await handleGetCities(context, req);
        }
      } else if (action === 'complete') {
        await handleGetCompleteLocations(context, req);
      } else {
        // Por defecto, devolver todas las localidades completas
        await handleGetCompleteLocations(context, req);
      }
    } else if (method === 'POST') {
      if (action === 'countries') {
        await handleCreateCountry(context, req);
      } else if (action === 'provinces') {
        await handleCreateProvince(context, req);
      } else if (action === 'cities') {
        await handleCreateCity(context, req);
      } else {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Acción no válida para POST. Use: countries, provinces, o cities',
            timestamp: new Date().toISOString(),
          },
        };
      }
    } else if (method === 'PUT') {
      if (action === 'countries') {
        const id = req.query.id as string;
        if (!id) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de país requerido',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        await handleUpdateCountry(context, req, id);
      } else if (action === 'provinces') {
        const id = req.query.id as string;
        if (!id) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de provincia requerido',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        await handleUpdateProvince(context, req, id);
      } else if (action === 'cities') {
        const id = req.query.id as string;
        if (!id) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de ciudad requerido',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        await handleUpdateCity(context, req, id);
      } else {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Acción no válida para PUT. Use: countries, provinces, o cities',
            timestamp: new Date().toISOString(),
          },
        };
      }
    } else if (method === 'DELETE') {
      if (action === 'countries') {
        const id = req.query.id as string;
        if (!id) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de país requerido',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        await handleDeleteCountry(context, req, id);
      } else if (action === 'provinces') {
        const id = req.query.id as string;
        if (!id) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de provincia requerido',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        await handleDeleteProvince(context, req, id);
      } else if (action === 'cities') {
        const id = req.query.id as string;
        if (!id) {
          context.res = {
            status: 400,
            body: {
              success: false,
              message: 'ID de ciudad requerido',
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        await handleDeleteCity(context, req, id);
      } else {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'Acción no válida para DELETE. Use: countries, provinces, o cities',
            timestamp: new Date().toISOString(),
          },
        };
      }
    } else {
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
    logger.error('Error en locations handler:', error);
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

// Obtener todos los países
async function handleGetCountries(context: Context, req: HttpRequest): Promise<void> {
  try {
    const countries = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_country')
      .where('isactive', true)
      .orderBy('country_name');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: countries,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener países:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener países',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Obtener provincias (opcionalmente filtrado por país)
async function handleGetProvinces(context: Context, req: HttpRequest): Promise<void> {
  try {
    const idcountry = req.query.idcountry as string;

    let query = db.getConnection()
      .select(
        'p.*',
        'c.country_name',
        'c.country_code'
      )
      .from('nubestock.tb_mae_province as p')
      .leftJoin('nubestock.tb_mae_country as c', 'c.idcountry', 'p.idcountry')
      .where('p.isactive', true);

    if (idcountry) {
      query = query.where('p.idcountry', idcountry);
    }

    const provinces = await query.orderBy('p.province_name');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: provinces,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener provincias:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener provincias',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Obtener ciudades (opcionalmente filtrado por provincia)
async function handleGetCities(context: Context, req: HttpRequest): Promise<void> {
  try {
    const idprovince = req.query.idprovince as string;

    let query = db.getConnection()
      .select(
        'ci.*',
        'p.province_name',
        'p.province_code',
        'c.country_name',
        'c.country_code'
      )
      .from('nubestock.tb_mae_city as ci')
      .leftJoin('nubestock.tb_mae_province as p', 'p.idprovince', 'ci.idprovince')
      .leftJoin('nubestock.tb_mae_country as c', 'c.idcountry', 'p.idcountry')
      .where('ci.isactive', true);

    if (idprovince) {
      query = query.where('ci.idprovince', idprovince);
    }

    const cities = await query.orderBy('ci.city_name');

    context.res = {
      status: 200,
      body: {
        success: true,
        data: cities,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener ciudades:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener ciudades',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// Obtener todas las localidades completas en estructura jerárquica (países → provincias → ciudades)
async function handleGetCompleteLocations(context: Context, req: HttpRequest): Promise<void> {
  try {
    const idcountry = req.query.idcountry as string;
    const idprovince = req.query.idprovince as string;
    const idcity = req.query.idcity as string;

    // Obtener todos los datos en un solo SELECT usando la vista
    let query = db.getConnection()
      .select('*')
      .from('nubestock.vw_location_complete');

    // Aplicar filtros opcionales
    if (idcountry) {
      query = query.where('idcountry', idcountry);
    }
    if (idprovince) {
      query = query.where('idprovince', idprovince);
    }
    if (idcity) {
      query = query.where('idcity', idcity);
    }

    const locations = await query
      .orderBy('country_name', 'asc')
      .orderBy('province_name', 'asc')
      .orderBy('city_name', 'asc');

    // Estructurar los datos de forma jerárquica
    const countriesMap = new Map<string, {
      idcountry: string;
      country_name: string;
      country_code: string;
      provinces: Map<string, ProvinceNode>;
    }>();

    locations.forEach((location: any) => {
      const countryId = location.idcountry;
      
      // Si el país no existe en el mapa, crearlo
      if (!countriesMap.has(countryId)) {
        countriesMap.set(countryId, {
          idcountry: location.idcountry,
          country_name: location.country_name,
          country_code: location.country_code,
          provinces: new Map<string, ProvinceNode>()
        });
      }

      const country = countriesMap.get(countryId)!;
      const provinceId = location.idprovince;

      // Si la provincia no existe en el país, crearla
      if (!country.provinces.has(provinceId)) {
        country.provinces.set(provinceId, {
          idprovince: location.idprovince,
          province_name: location.province_name,
          province_code: location.province_code,
          cities: []
        });
      }

      const province = country.provinces.get(provinceId)!;

      // Agregar la ciudad a la provincia
      province.cities.push({
        idcity: location.idcity,
        city_name: location.city_name,
        city_code: location.city_code
      });
    });

    // Convertir Maps a Arrays
    const countries: CountryNode[] = Array.from(countriesMap.values()).map(country => ({
      idcountry: country.idcountry,
      country_name: country.country_name,
      country_code: country.country_code,
      provinces: Array.from(country.provinces.values())
    }));

    context.res = {
      status: 200,
      body: {
        success: true,
        data: countries,
        count: countries.length,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener localidades completas:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener localidades completas',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ========== CRUD OPERATIONS FOR COUNTRIES ==========

async function handleGetCountryById(context: Context, req: HttpRequest, countryId: string): Promise<void> {
  try {
    const country = await db.findById('nubestock.tb_mae_country', countryId);

    if (!country) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'País no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: country,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener país:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener país',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateCountry(context: Context, req: HttpRequest): Promise<void> {
  try {
    const countrySchema = Joi.object({
      country_name: Joi.string().min(2).max(100).required(),
      country_code: Joi.string().min(2).max(10).required(),
      isactive: Joi.boolean().optional().default(true),
    });

    const { error, value } = countrySchema.validate(req.body);

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

    // Verificar si el código de país ya existe
    const existingCountry = await db.getConnection()
      .select('idcountry')
      .from('nubestock.tb_mae_country')
      .where('country_code', value.country_code)
      .first();

    if (existingCountry) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El código de país ya está registrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newCountry = await db.create('nubestock.tb_mae_country', {
      ...value,
      isactive: value.isactive !== undefined ? value.isactive : true,
      creationdate: new Date(),
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newCountry,
        message: 'País creado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear país:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear país',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateCountry(context: Context, req: HttpRequest, countryId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      country_name: Joi.string().min(2).max(100).optional(),
      country_code: Joi.string().min(2).max(10).optional(),
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

    // Verificar si el país existe
    const existingCountry = await db.findById('nubestock.tb_mae_country', countryId);
    if (!existingCountry) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'País no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar si el código de país ya existe (si se está cambiando)
    if (value.country_code && value.country_code !== (existingCountry as any).country_code) {
      const codeExists = await db.getConnection()
        .select('idcountry')
        .from('nubestock.tb_mae_country')
        .where('country_code', value.country_code)
        .where('idcountry', '!=', countryId)
        .first();

      if (codeExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El código de país ya está registrado',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedCountry = await db.update('nubestock.tb_mae_country', countryId, {
      ...value,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedCountry,
        message: 'País actualizado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar país:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar país',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteCountry(context: Context, req: HttpRequest, countryId: string): Promise<void> {
  try {
    const country = await db.findById('nubestock.tb_mae_country', countryId);

    if (!country) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'País no encontrado',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    await db.delete('nubestock.tb_mae_country', countryId);

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'País eliminado exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar país:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar país',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ========== CRUD OPERATIONS FOR PROVINCES ==========

async function handleGetProvinceById(context: Context, req: HttpRequest, provinceId: string): Promise<void> {
  try {
    const province = await db.getConnection()
      .select(
        'p.*',
        'c.country_name',
        'c.country_code'
      )
      .from('nubestock.tb_mae_province as p')
      .leftJoin('nubestock.tb_mae_country as c', 'c.idcountry', 'p.idcountry')
      .where('p.idprovince', provinceId)
      .first();

    if (!province) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Provincia no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: province,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener provincia:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener provincia',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateProvince(context: Context, req: HttpRequest): Promise<void> {
  try {
    const provinceSchema = Joi.object({
      province_name: Joi.string().min(2).max(100).required(),
      province_code: Joi.string().min(2).max(10).optional().allow('', null),
      idcountry: Joi.string().uuid().required(),
      isactive: Joi.boolean().optional().default(true),
    });

    const { error, value } = provinceSchema.validate(req.body);

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

    // Verificar que el país existe
    const countryExists = await db.findById('nubestock.tb_mae_country', value.idcountry);
    if (!countryExists) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'El país especificado no existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newProvince = await db.create('nubestock.tb_mae_province', {
      ...value,
      isactive: value.isactive !== undefined ? value.isactive : true,
      creationdate: new Date(),
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newProvince,
        message: 'Provincia creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear provincia:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear provincia',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateProvince(context: Context, req: HttpRequest, provinceId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      province_name: Joi.string().min(2).max(100).optional(),
      province_code: Joi.string().min(2).max(10).optional().allow('', null),
      idcountry: Joi.string().uuid().optional(),
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

    // Verificar si la provincia existe
    const existingProvince = await db.findById('nubestock.tb_mae_province', provinceId);
    if (!existingProvince) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Provincia no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que el país existe (si se está cambiando)
    if (value.idcountry) {
      const countryExists = await db.findById('nubestock.tb_mae_country', value.idcountry);
      if (!countryExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'El país especificado no existe',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedProvince = await db.update('nubestock.tb_mae_province', provinceId, {
      ...value,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedProvince,
        message: 'Provincia actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar provincia:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar provincia',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteProvince(context: Context, req: HttpRequest, provinceId: string): Promise<void> {
  try {
    const province = await db.findById('nubestock.tb_mae_province', provinceId);

    if (!province) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Provincia no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    await db.delete('nubestock.tb_mae_province', provinceId);

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Provincia eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar provincia:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar provincia',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

// ========== CRUD OPERATIONS FOR CITIES ==========

async function handleGetCityById(context: Context, req: HttpRequest, cityId: string): Promise<void> {
  try {
    const city = await db.getConnection()
      .select(
        'ci.*',
        'p.province_name',
        'p.province_code',
        'c.country_name',
        'c.country_code'
      )
      .from('nubestock.tb_mae_city as ci')
      .leftJoin('nubestock.tb_mae_province as p', 'p.idprovince', 'ci.idprovince')
      .leftJoin('nubestock.tb_mae_country as c', 'c.idcountry', 'p.idcountry')
      .where('ci.idcity', cityId)
      .first();

    if (!city) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Ciudad no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    context.res = {
      status: 200,
      body: {
        success: true,
        data: city,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al obtener ciudad:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al obtener ciudad',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleCreateCity(context: Context, req: HttpRequest): Promise<void> {
  try {
    const citySchema = Joi.object({
      city_name: Joi.string().min(2).max(100).required(),
      city_code: Joi.string().min(2).max(10).optional().allow('', null),
      idprovince: Joi.string().uuid().required(),
      isactive: Joi.boolean().optional().default(true),
    });

    const { error, value } = citySchema.validate(req.body);

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

    // Verificar que la provincia existe
    const provinceExists = await db.findById('nubestock.tb_mae_province', value.idprovince);
    if (!provinceExists) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'La provincia especificada no existe',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const newCity = await db.create('nubestock.tb_mae_city', {
      ...value,
      isactive: value.isactive !== undefined ? value.isactive : true,
      creationdate: new Date(),
    });

    context.res = {
      status: 201,
      body: {
        success: true,
        data: newCity,
        message: 'Ciudad creada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al crear ciudad:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al crear ciudad',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleUpdateCity(context: Context, req: HttpRequest, cityId: string): Promise<void> {
  try {
    const updateSchema = Joi.object({
      city_name: Joi.string().min(2).max(100).optional(),
      city_code: Joi.string().min(2).max(10).optional().allow('', null),
      idprovince: Joi.string().uuid().optional(),
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

    // Verificar si la ciudad existe
    const existingCity = await db.findById('nubestock.tb_mae_city', cityId);
    if (!existingCity) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Ciudad no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    // Verificar que la provincia existe (si se está cambiando)
    if (value.idprovince) {
      const provinceExists = await db.findById('nubestock.tb_mae_province', value.idprovince);
      if (!provinceExists) {
        context.res = {
          status: 400,
          body: {
            success: false,
            message: 'La provincia especificada no existe',
            timestamp: new Date().toISOString(),
          },
        };
        return;
      }
    }

    const updatedCity = await db.update('nubestock.tb_mae_city', cityId, {
      ...value,
      modificationdate: new Date(),
    });

    context.res = {
      status: 200,
      body: {
        success: true,
        data: updatedCity,
        message: 'Ciudad actualizada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al actualizar ciudad:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al actualizar ciudad',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

async function handleDeleteCity(context: Context, req: HttpRequest, cityId: string): Promise<void> {
  try {
    const city = await db.findById('nubestock.tb_mae_city', cityId);

    if (!city) {
      context.res = {
        status: 404,
        body: {
          success: false,
          message: 'Ciudad no encontrada',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    await db.delete('nubestock.tb_mae_city', cityId);

    context.res = {
      status: 200,
      body: {
        success: true,
        message: 'Ciudad eliminada exitosamente',
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    logger.error('Error al eliminar ciudad:', error);
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'Error al eliminar ciudad',
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export default locationsHandler;

