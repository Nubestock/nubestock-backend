import { Context, HttpRequest } from '../types/azure-functions';
import { Database } from '../config/database';
import { logger } from '../config/logger';
import { CityNode, ProvinceNode, CountryNode } from '../interfaces';
import Joi from 'joi';

const db = Database.getInstance();

// ========== LIST OPERATIONS ==========

export async function listCountries(context: Context, req: HttpRequest): Promise<void> {
  try {
    const countries = await db.getConnection()
      .select('*')
      .from('nubestock.tb_mae_country')
      .where('is_active', true)
      .orderBy('name');

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

export async function listProvinces(context: Context, req: HttpRequest): Promise<void> {
  try {
    const id_country = req.query.id_country as string;
    const idCountryNum = id_country ? Number.parseInt(id_country, 10) : null;

    let query = db.getConnection()
      .select(
        'p.*',
        'c.name as country_name',
        'c.is_code as country_code'
      )
      .from('nubestock.tb_mae_province as p')
      .leftJoin('nubestock.tb_mae_country as c', 'c.id', 'p.id_country')
      .where('p.is_active', true);

    if (idCountryNum && !Number.isNaN(idCountryNum)) {
      query = query.where('p.id_country', idCountryNum);
    }

    const provinces = await query.orderBy('p.name');

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

export async function listCities(context: Context, req: HttpRequest): Promise<void> {
  try {
    const id_province = req.query.id_province as string;
    const idProvinceNum = id_province ? Number.parseInt(id_province, 10) : null;

    let query = db.getConnection()
      .select(
        'ci.*',
        'p.name as province_name',
        'p.is_code as province_code',
        'c.name as country_name',
        'c.is_code as country_code'
      )
      .from('nubestock.tb_mae_city as ci')
      .leftJoin('nubestock.tb_mae_province as p', 'p.id', 'ci.id_province')
      .leftJoin('nubestock.tb_mae_country as c', 'c.id', 'p.id_country')
      .where('ci.is_active', true);

    if (idProvinceNum && !Number.isNaN(idProvinceNum)) {
      query = query.where('ci.id_province', idProvinceNum);
    }

    const cities = await query.orderBy('ci.name');

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

function applyLocationFilters(query: any, filters: { id_country?: string; id_province?: string; id_city?: string }): any {
  const { id_country, id_province, id_city } = filters;
  
  if (id_country) {
    const idCountryNum = Number.parseInt(id_country, 10);
    if (!Number.isNaN(idCountryNum)) query = query.where('c.id', idCountryNum);
  }
  if (id_province) {
    const idProvinceNum = Number.parseInt(id_province, 10);
    if (!Number.isNaN(idProvinceNum)) query = query.where('p.id', idProvinceNum);
  }
  if (id_city) {
    const idCityNum = Number.parseInt(id_city, 10);
    if (!Number.isNaN(idCityNum)) query = query.where('ci.id', idCityNum);
  }
  
  return query;
}

function buildLocationHierarchy(locations: any[]): CountryNode[] {
  const countriesMap = new Map<number, {
    id: number;
    name: string;
    is_code: string;
    provinces: Map<number, ProvinceNode>;
  }>();

  for (const location of locations) {
    const countryId = location.id_country;
    if (!countryId) continue;
    
    if (!countriesMap.has(countryId)) {
      countriesMap.set(countryId, {
        id: countryId,
        name: location.country_name,
        is_code: location.country_code,
        provinces: new Map<number, ProvinceNode>()
      });
    }

    const country = countriesMap.get(countryId)!;
    const provinceId = location.id_province;
    if (!provinceId) continue;

    if (!country.provinces.has(provinceId)) {
      country.provinces.set(provinceId, {
        id: provinceId,
        name: location.province_name,
        is_code: location.province_code,
        cities: []
      });
    }

    const province = country.provinces.get(provinceId)!;
    if (location.id_city) {
      province.cities.push({
        id: location.id_city,
        name: location.city_name,
        is_code: location.city_code
      });
    }
  }

  return Array.from(countriesMap.values()).map(country => ({
    id: country.id,
    name: country.name,
    is_code: country.is_code,
    provinces: Array.from(country.provinces.values())
  }));
}

export async function getCompleteLocations(context: Context, req: HttpRequest): Promise<void> {
  try {
    let query = db.getConnection()
      .select(
        'c.id as id_country',
        'c.name as country_name',
        'c.is_code as country_code',
        'p.id as id_province',
        'p.name as province_name',
        'p.is_code as province_code',
        'ci.id as id_city',
        'ci.name as city_name',
        'ci.is_code as city_code'
      )
      .from('nubestock.tb_mae_country as c')
      .leftJoin('nubestock.tb_mae_province as p', 'p.id_country', 'c.id')
      .leftJoin('nubestock.tb_mae_city as ci', 'ci.id_province', 'p.id')
      .where('c.is_active', true)
      .where('p.is_active', true)
      .orWhereNull('p.is_active')
      .where('ci.is_active', true)
      .orWhereNull('ci.is_active');

    query = applyLocationFilters(query, {
      id_country: req.query.id_country as string,
      id_province: req.query.id_province as string,
      id_city: req.query.id_city as string,
    });

    const locations = await query
      .orderBy('country_name', 'asc')
      .orderBy('province_name', 'asc')
      .orderBy('city_name', 'asc');

    const countries = buildLocationHierarchy(locations);

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

// ========== GET BY ID OPERATIONS ==========

export async function getCountryById(context: Context, req: HttpRequest, countryId: string): Promise<void> {
  try {
    const countryIdNum = Number.parseInt(countryId, 10);
    if (Number.isNaN(countryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de país inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const country = await db.findById('nubestock.tb_mae_country', countryIdNum);

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

export async function getProvinceById(context: Context, req: HttpRequest, provinceId: string): Promise<void> {
  try {
    const provinceIdNum = Number.parseInt(provinceId, 10);
    if (Number.isNaN(provinceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de provincia inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const province = await db.getConnection()
      .select(
        'p.*',
        'c.name as country_name',
        'c.is_code as country_code'
      )
      .from('nubestock.tb_mae_province as p')
      .leftJoin('nubestock.tb_mae_country as c', 'c.id', 'p.id_country')
      .where('p.id', provinceIdNum)
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

export async function getCityById(context: Context, req: HttpRequest, cityId: string): Promise<void> {
  try {
    const cityIdNum = Number.parseInt(cityId, 10);
    if (Number.isNaN(cityIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de ciudad inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const city = await db.getConnection()
      .select(
        'ci.*',
        'p.name as province_name',
        'p.is_code as province_code',
        'c.name as country_name',
        'c.is_code as country_code'
      )
      .from('nubestock.tb_mae_city as ci')
      .leftJoin('nubestock.tb_mae_province as p', 'p.id', 'ci.id_province')
      .leftJoin('nubestock.tb_mae_country as c', 'c.id', 'p.id_country')
      .where('ci.id', cityIdNum)
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

// ========== CREATE OPERATIONS ==========

export async function createCountry(context: Context, req: HttpRequest): Promise<void> {
  try {
    const countrySchema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      is_code: Joi.string().min(2).max(5).required(),
      is_active: Joi.boolean().optional().default(true),
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
      .select('id')
      .from('nubestock.tb_mae_country')
      .where('is_code', value.is_code)
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
      name: value.name,
      is_code: value.is_code,
      is_active: value.is_active !== undefined ? value.is_active : true,
      creation_date: new Date(),
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

export async function createProvince(context: Context, req: HttpRequest): Promise<void> {
  try {
    const provinceSchema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      is_code: Joi.string().min(2).max(5).optional().allow('', null),
      id_country: Joi.number().integer().required(),
      is_active: Joi.boolean().optional().default(true),
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
    const countryExists = await db.findById('nubestock.tb_mae_country', value.id_country);
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
      name: value.name,
      is_code: value.is_code || null,
      id_country: value.id_country,
      is_active: value.is_active !== undefined ? value.is_active : true,
      creation_date: new Date(),
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

export async function createCity(context: Context, req: HttpRequest): Promise<void> {
  try {
    const citySchema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      is_code: Joi.string().min(2).max(5).optional().allow('', null),
      id_province: Joi.number().integer().required(),
      is_active: Joi.boolean().optional().default(true),
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
    const provinceExists = await db.findById('nubestock.tb_mae_province', value.id_province);
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
      name: value.name,
      is_code: value.is_code || null,
      id_province: value.id_province,
      is_active: value.is_active !== undefined ? value.is_active : true,
      creation_date: new Date(),
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

// ========== UPDATE OPERATIONS ==========

export async function updateCountry(context: Context, req: HttpRequest, countryId: string): Promise<void> {
  try {
    const countryIdNum = Number.parseInt(countryId, 10);
    if (Number.isNaN(countryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de país inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updateSchema = Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      is_code: Joi.string().min(2).max(5).optional(),
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

    // Verificar si el país existe
    const existingCountry = await db.findById('nubestock.tb_mae_country', countryIdNum);
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
    if (value.is_code && value.is_code !== (existingCountry as any).is_code) {
      const codeExists = await db.getConnection()
        .select('id')
        .from('nubestock.tb_mae_country')
        .where('is_code', value.is_code)
        .where('id', '!=', countryIdNum)
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

    const updateData: any = {
      modification_date: new Date(),
    };
    if (value.name) updateData.name = value.name;
    if (value.is_code) updateData.is_code = value.is_code;
    if (value.is_active !== undefined) updateData.is_active = value.is_active;

    const updatedCountry = await db.update('nubestock.tb_mae_country', countryIdNum, updateData);

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

export async function updateProvince(context: Context, req: HttpRequest, provinceId: string): Promise<void> {
  try {
    const provinceIdNum = Number.parseInt(provinceId, 10);
    if (Number.isNaN(provinceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de provincia inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updateSchema = Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      is_code: Joi.string().min(2).max(5).optional().allow('', null),
      id_country: Joi.number().integer().optional(),
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

    // Verificar si la provincia existe
    const existingProvince = await db.findById('nubestock.tb_mae_province', provinceIdNum);
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
    if (value.id_country) {
      const countryExists = await db.findById('nubestock.tb_mae_country', value.id_country);
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

    const updateData: any = {
      modification_date: new Date(),
    };
    if (value.name) updateData.name = value.name;
    if (value.is_code !== undefined) updateData.is_code = value.is_code || null;
    if (value.id_country) updateData.id_country = value.id_country;
    if (value.is_active !== undefined) updateData.is_active = value.is_active;

    const updatedProvince = await db.update('nubestock.tb_mae_province', provinceIdNum, updateData);

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

export async function updateCity(context: Context, req: HttpRequest, cityId: string): Promise<void> {
  try {
    const cityIdNum = Number.parseInt(cityId, 10);
    if (Number.isNaN(cityIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de ciudad inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const updateSchema = Joi.object({
      name: Joi.string().min(2).max(100).optional(),
      is_code: Joi.string().min(2).max(5).optional().allow('', null),
      id_province: Joi.number().integer().optional(),
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

    // Verificar si la ciudad existe
    const existingCity = await db.findById('nubestock.tb_mae_city', cityIdNum);
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
    if (value.id_province) {
      const provinceExists = await db.findById('nubestock.tb_mae_province', value.id_province);
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

    const updateData: any = {
      modification_date: new Date(),
    };
    if (value.name) updateData.name = value.name;
    if (value.is_code !== undefined) updateData.is_code = value.is_code || null;
    if (value.id_province) updateData.id_province = value.id_province;
    if (value.is_active !== undefined) updateData.is_active = value.is_active;

    const updatedCity = await db.update('nubestock.tb_mae_city', cityIdNum, updateData);

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

// ========== DELETE OPERATIONS ==========

export async function deleteCountry(context: Context, req: HttpRequest, countryId: string): Promise<void> {
  try {
    const countryIdNum = Number.parseInt(countryId, 10);
    if (Number.isNaN(countryIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de país inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const country = await db.findById('nubestock.tb_mae_country', countryIdNum);

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

    await db.delete('nubestock.tb_mae_country', countryIdNum);

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

export async function deleteProvince(context: Context, req: HttpRequest, provinceId: string): Promise<void> {
  try {
    const provinceIdNum = Number.parseInt(provinceId, 10);
    if (Number.isNaN(provinceIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de provincia inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const province = await db.findById('nubestock.tb_mae_province', provinceIdNum);

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

    await db.delete('nubestock.tb_mae_province', provinceIdNum);

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

export async function deleteCity(context: Context, req: HttpRequest, cityId: string): Promise<void> {
  try {
    const cityIdNum = Number.parseInt(cityId, 10);
    if (Number.isNaN(cityIdNum)) {
      context.res = {
        status: 400,
        body: {
          success: false,
          message: 'ID de ciudad inválido',
          timestamp: new Date().toISOString(),
        },
      };
      return;
    }

    const city = await db.findById('nubestock.tb_mae_city', cityIdNum);

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

    await db.delete('nubestock.tb_mae_city', cityIdNum);

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
