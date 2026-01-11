# Documentación de Integración - Producción

## Tabla de Contenidos
1. [Introducción](#introducción)
2. [Autenticación](#autenticación)
3. [API de Producción Diaria](#api-de-producción-diaria)
4. [API de Estadísticas](#api-de-estadísticas)
5. [API de Transacciones](#api-de-transacciones)
6. [Ejemplos de Integración](#ejemplos-de-integración)
7. [Manejo de Errores](#manejo-de-errores)
8. [Mejores Prácticas](#mejores-prácticas)
9. [Preguntas Frecuentes](#preguntas-frecuentes)

---

## Introducción

Esta documentación describe cómo integrar un sistema externo con la API de Producción de Nubestock. El sistema permite registrar producción diaria, consultar estadísticas, y gestionar transacciones de inventario relacionadas con la producción.

### Endpoints Principales

- **Base URL**: `https://tu-funcion-app.azurewebsites.net/api` (Producción)
- **Base URL Local**: `http://localhost:7071/api` (Desarrollo)
- **Autenticación**: JWT Bearer Token
- **Formato de Respuesta**: JSON

### Funcionalidades Principales

✅ **Registrar Producción Diaria**: Registrar la cantidad producida de un producto  
✅ **Consultar Producción**: Obtener registros de producción con filtros  
✅ **Estadísticas de Producción**: Obtener reportes y métricas de producción  
✅ **Transacciones de Inventario**: Gestionar movimientos de inventario por producción  
✅ **Actualizar Producción**: Modificar registros de producción existentes

---

## Autenticación

Para usar la API de Producción, debes autenticarte primero. Consulta la [Documentación de Autenticación](#) para obtener tu token JWT.

### Permisos Requeridos

- **Lectura (`production_read`)**: Para consultar producción y estadísticas
- **Escritura (`production_write`)**: Para registrar y actualizar producción

**Ejemplo de Header:**
```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer tu_token_jwt'
}
```

---

## API de Producción Diaria

### 1. Registrar Producción Diaria

#### Endpoint: `POST /production/register`

**Descripción**: Registra la producción diaria de un producto. Este endpoint crea un registro de producción y automáticamente genera una transacción de inventario.

**Request Body:**
```json
{
  "idfinal_product": "uuid-del-producto",
  "production_date": "2024-01-15T08:00:00.000Z",
  "quantity_produced": 150.5,
  "unit_of_measure": "kg",
  "notes": "Producción normal del turno matutino",
  "iduser": "uuid-del-usuario",
  "device_token": "token-del-dispositivo-para-notificaciones",
  "platform": "android",
  "app_version": "1.0.0",
  "device_model": "Samsung Galaxy S21"
}
```

**Campos Requeridos:**
- `idfinal_product` (UUID): ID del producto final producido
- `production_date` (Date, ISO 8601): Fecha y hora de la producción
- `quantity_produced` (number, positivo): Cantidad producida
- `unit_of_measure` (string, 2-20 caracteres): Unidad de medida (ej: "kg", "lt", "un", "cajas")

**Campos Opcionales:**
- `iduser` (UUID): ID del usuario que registra. Si no se proporciona, se usa el del token
- `notes` (string, máximo 500 caracteres): Notas adicionales sobre la producción
- `device_token` (string, máximo 500 caracteres): Token del dispositivo para notificaciones push
- `platform` (string, enum: 'ios' | 'android'): Plataforma del dispositivo
- `app_version` (string, máximo 20 caracteres): Versión de la app
- `device_model` (string, máximo 100 caracteres): Modelo del dispositivo

**Qué Hace Este Endpoint:**
1. ✅ Valida que el producto existe y está activo
2. ✅ Crea el registro de producción diaria
3. ✅ Crea automáticamente una transacción de inventario tipo 'production'
4. ✅ Actualiza o registra el device_token del usuario (para notificaciones push)

**Response Exitosa (201 Created):**
```json
{
  "success": true,
  "data": {
    "iddaily_production": "uuid-registro-produccion",
    "iduser": "uuid-del-usuario",
    "idfinal_product": "uuid-del-producto",
    "production_date": "2024-01-15T08:00:00.000Z",
    "quantity_produced": "150.5",
    "unit_of_measure": "kg",
    "notes": "Producción normal del turno matutino",
    "isactive": true,
    "creationdate": "2024-01-15T08:05:00.000Z",
    "modificationdate": "2024-01-15T08:05:00.000Z"
  },
  "message": "Producción registrada exitosamente",
  "timestamp": "2024-01-15T08:05:00.000Z"
}
```

**Response Error (404 Not Found) - Producto no existe:**
```json
{
  "success": false,
  "message": "Producto no encontrado",
  "timestamp": "2024-01-15T08:05:00.000Z"
}
```

**Response Error (400 Bad Request) - Datos inválidos:**
```json
{
  "success": false,
  "message": "Datos de entrada inválidos",
  "errors": [
    {
      "field": "quantity_produced",
      "message": "\"quantity_produced\" must be a positive number"
    }
  ],
  "timestamp": "2024-01-15T08:05:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function registrarProduccion(token, datosProduccion) {
  const response = await fetch(
    'https://tu-funcion-app.azurewebsites.net/api/production/register',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(datosProduccion)
    }
  );

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al registrar producción');
  }

  return result.data;
}

// Uso: Registrar producción
const produccion = await registrarProduccion(token, {
  idfinal_product: 'uuid-del-producto',
  production_date: new Date().toISOString(),
  quantity_produced: 150.5,
  unit_of_measure: 'kg',
  notes: 'Producción del turno matutino',
  device_token: 'token-dispositivo-fcm'
});
```

---

### 2. Obtener Producción Diaria

#### Endpoint: `GET /production/daily`

**Descripción**: Obtiene los registros de producción diaria con filtros opcionales y paginación.

**Query Parameters:**
- `page` (opcional, number, default: 1): Número de página
- `limit` (opcional, number, default: 10): Cantidad de registros por página
- `startDate` (opcional, string, ISO 8601): Fecha de inicio del rango
- `endDate` (opcional, string, ISO 8601): Fecha de fin del rango
- `iduser` (opcional, UUID): Filtrar por usuario específico
- `idfinal_product` (opcional, UUID): Filtrar por producto específico

**Ejemplo de Request:**
```
GET /production/daily?startDate=2024-01-01&endDate=2024-01-31&idfinal_product=uuid-producto&page=1&limit=20
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "iddaily_production": "uuid-registro-1",
      "iduser": "uuid-usuario-1",
      "idfinal_product": "uuid-producto-1",
      "production_date": "2024-01-15T08:00:00.000Z",
      "quantity_produced": "150.5",
      "unit_of_measure": "kg",
      "notes": "Producción normal",
      "isactive": true,
      "creationdate": "2024-01-15T08:05:00.000Z",
      "modificationdate": "2024-01-15T08:05:00.000Z",
      "nameuser": "Juan Pérez",
      "product_name": "Snack de Maíz",
      "sku": "SNK-001",
      "namecategory": "Snacks"
    },
    {
      "iddaily_production": "uuid-registro-2",
      "iduser": "uuid-usuario-1",
      "idfinal_product": "uuid-producto-2",
      "production_date": "2024-01-15T14:00:00.000Z",
      "quantity_produced": "200.0",
      "unit_of_measure": "kg",
      "notes": "Producción del turno vespertino",
      "isactive": true,
      "creationdate": "2024-01-15T14:10:00.000Z",
      "modificationdate": "2024-01-15T14:10:00.000Z",
      "nameuser": "Juan Pérez",
      "product_name": "Snack de Yuca",
      "sku": "SNK-002",
      "namecategory": "Snacks"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function obtenerProduccion(token, filtros = {}) {
  const params = new URLSearchParams();
  
  if (filtros.page) params.append('page', filtros.page.toString());
  if (filtros.limit) params.append('limit', filtros.limit.toString());
  if (filtros.startDate) params.append('startDate', filtros.startDate);
  if (filtros.endDate) params.append('endDate', filtros.endDate);
  if (filtros.iduser) params.append('iduser', filtros.iduser);
  if (filtros.idfinal_product) params.append('idfinal_product', filtros.idfinal_product);

  const url = `https://tu-funcion-app.azurewebsites.net/api/production/daily?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al obtener producción');
  }

  return result;
}

// Uso: Obtener producción del mes actual
const hoy = new Date();
const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

const produccion = await obtenerProduccion(token, {
  startDate: primerDia.toISOString(),
  endDate: ultimoDia.toISOString(),
  page: 1,
  limit: 50
});

console.log(`Total de registros: ${produccion.pagination.total}`);
console.log(`Páginas: ${produccion.pagination.totalPages}`);
```

---

### 3. Actualizar Producción

#### Endpoint: `PUT /production/{iddaily_production}`

**Descripción**: Actualiza un registro de producción existente. Solo se pueden modificar ciertos campos.

**Path Parameters:**
- `iddaily_production` (requerido, UUID): ID del registro de producción a actualizar

**Request Body:**
```json
{
  "quantity_produced": 175.0,
  "unit_of_measure": "kg",
  "notes": "Cantidad corregida después de verificación"
}
```

**Campos Opcionales (solo estos se pueden actualizar):**
- `quantity_produced` (number, positivo): Nueva cantidad producida
- `unit_of_measure` (string, 2-20 caracteres): Nueva unidad de medida
- `notes` (string, máximo 500 caracteres): Notas adicionales

**Nota**: No se pueden actualizar `production_date`, `idfinal_product`, ni `iduser`.

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": {
    "iddaily_production": "uuid-registro-produccion",
    "iduser": "uuid-del-usuario",
    "idfinal_product": "uuid-del-producto",
    "production_date": "2024-01-15T08:00:00.000Z",
    "quantity_produced": "175.0",
    "unit_of_measure": "kg",
    "notes": "Cantidad corregida después de verificación",
    "isactive": true,
    "creationdate": "2024-01-15T08:05:00.000Z",
    "modificationdate": "2024-01-15T10:30:00.000Z"
  },
  "message": "Producción actualizada exitosamente",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function actualizarProduccion(token, produccionId, cambios) {
  const response = await fetch(
    `https://tu-funcion-app.azurewebsites.net/api/production/${produccionId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(cambios)
    }
  );

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al actualizar producción');
  }

  return result.data;
}

// Uso: Corregir cantidad producida
const produccionActualizada = await actualizarProduccion(
  token,
  'uuid-registro-produccion',
  {
    quantity_produced: 175.0,
    notes: 'Cantidad corregida después de verificación'
  }
);
```

---

## API de Estadísticas

### Obtener Estadísticas de Producción

#### Endpoint: `GET /production/stats`

**Descripción**: Obtiene estadísticas agregadas de producción por producto, usuario y generales para un rango de fechas.

**Query Parameters:**
- `startDate` (opcional, string, ISO 8601, default: fecha actual): Fecha de inicio del rango
- `endDate` (opcional, string, ISO 8601, default: fecha actual): Fecha de fin del rango

**Ejemplo de Request:**
```
GET /production/stats?startDate=2024-01-01&endDate=2024-01-31
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": {
    "general": {
      "total_production": "4520.5",
      "active_users": 5,
      "products_produced": 8,
      "total_records": 125
    },
    "byProduct": [
      {
        "product_name": "Snack de Maíz",
        "sku": "SNK-001",
        "namecategory": "Snacks",
        "total_produced": "1250.5",
        "production_days": "25",
        "average_daily": "50.02"
      },
      {
        "product_name": "Snack de Yuca",
        "sku": "SNK-002",
        "namecategory": "Snacks",
        "total_produced": "980.0",
        "production_days": "20",
        "average_daily": "49.0"
      }
    ],
    "byUser": [
      {
        "nameuser": "Juan Pérez",
        "total_produced": "1520.5",
        "production_days": "30"
      },
      {
        "nameuser": "María García",
        "total_produced": "1200.0",
        "production_days": "28"
      }
    ],
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-01-31"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function obtenerEstadisticasProduccion(token, startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);

  const url = `https://tu-funcion-app.azurewebsites.net/api/production/stats?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al obtener estadísticas');
  }

  return result.data;
}

// Uso: Obtener estadísticas del mes actual
const hoy = new Date();
const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split('T')[0];

const estadisticas = await obtenerEstadisticasProduccion(token, primerDia, ultimoDia);

console.log(`Total producido: ${estadisticas.general.total_production}`);
console.log(`Usuarios activos: ${estadisticas.general.active_users}`);
console.log(`Productos producidos: ${estadisticas.general.products_produced}`);

// Estadísticas por producto
estadisticas.byProduct.forEach(producto => {
  console.log(`${producto.product_name}: ${producto.total_produced} ${producto.average_daily} promedio diario`);
});
```

---

## API de Transacciones

### 1. Crear Transacción

#### Endpoint: `POST /production/transaction`

**Descripción**: Crea una transacción de inventario. Las transacciones pueden ser de tipo purchase, production, sale, waste o adjustment.

**Request Body:**
```json
{
  "idfinal_product": "uuid-del-producto",
  "transaction_type": "production",
  "quantity": 150.5,
  "unit_of_measure": "kg",
  "unit_cost": 2.50,
  "total_cost": 376.25,
  "notes": "Compra de materia prima para producción"
}
```

**Campos Requeridos:**
- `transaction_type` (string, enum): Tipo de transacción
  - `purchase`: Compra de materiales/productos
  - `production`: Producción de productos
  - `sale`: Venta de productos
  - `waste`: Desperdicio o pérdida
  - `adjustment`: Ajuste de inventario
- `quantity` (number): Cantidad de la transacción (puede ser positivo o negativo)
- `unit_of_measure` (string, 2-20 caracteres): Unidad de medida

**Campos Opcionales:**
- `iduser` (UUID): ID del usuario. Si no se proporciona, se usa el del token
- `idfinal_product` (UUID): ID del producto final (para transacciones de productos)
- `idmaterial` (UUID): ID del material (para transacciones de materiales)
- `unit_cost` (number, positivo): Costo unitario
- `total_cost` (number, positivo): Costo total (se calcula automáticamente si se proporciona unit_cost)
- `notes` (string, máximo 500 caracteres): Notas adicionales

**Nota**: Debe proporcionarse al menos uno de `idfinal_product` o `idmaterial`.

**Response Exitosa (201 Created):**
```json
{
  "success": true,
  "data": {
    "idtransaction": "uuid-transaccion",
    "iduser": "uuid-del-usuario",
    "idfinal_product": "uuid-del-producto",
    "transaction_type": "production",
    "quantity": "150.5",
    "unit_of_measure": "kg",
    "unit_cost": "2.50",
    "total_cost": "376.25",
    "transaction_date": "2024-01-15T10:30:00.000Z",
    "notes": "Compra de materia prima para producción",
    "isactive": true,
    "creationdate": "2024-01-15T10:30:00.000Z",
    "modificationdate": "2024-01-15T10:30:00.000Z"
  },
  "message": "Transacción creada exitosamente",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function crearTransaccion(token, datosTransaccion) {
  const response = await fetch(
    'https://tu-funcion-app.azurewebsites.net/api/production/transaction',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(datosTransaccion)
    }
  );

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al crear transacción');
  }

  return result.data;
}

// Uso: Registrar compra de material
const transaccion = await crearTransaccion(token, {
  idmaterial: 'uuid-material',
  transaction_type: 'purchase',
  quantity: 500,
  unit_of_measure: 'kg',
  unit_cost: 2.50,
  notes: 'Compra de harina de maíz'
});
```

---

### 1.1. Registrar Desperdicios (Waste)

#### Ejemplos de Registro de Desperdicios

Los desperdicios se registran usando el tipo de transacción `waste`. Puedes registrar desperdicios tanto de **productos finales** como de **materiales**.

**Ejemplo 1: Desperdicio de Producto Final**

```javascript
// Registrar desperdicio de producto final (producto dañado, vencido, etc.)
const desperdicioProducto = await crearTransaccion(token, {
  idfinal_product: 'uuid-producto-final',
  transaction_type: 'waste',
  quantity: 25.5,  // Cantidad desperdiciada (positiva)
  unit_of_measure: 'kg',
  unit_cost: 3.50,  // Costo unitario del producto
  total_cost: 89.25,  // Costo total del desperdicio (opcional, se calcula si no se proporciona)
  notes: 'Producto dañado durante el transporte - Lote #12345'
});
```

**Request Body para Desperdicio de Producto:**
```json
{
  "idfinal_product": "uuid-del-producto-final",
  "transaction_type": "waste",
  "quantity": 25.5,
  "unit_of_measure": "kg",
  "unit_cost": 3.50,
  "total_cost": 89.25,
  "notes": "Producto dañado durante el transporte - Lote #12345"
}
```

**Ejemplo 2: Desperdicio de Material (Materia Prima)**

```javascript
// Registrar desperdicio de material (materia prima dañada, vencida, etc.)
const desperdicioMaterial = await crearTransaccion(token, {
  idmaterial: 'uuid-material',
  transaction_type: 'waste',
  quantity: 10.0,  // Cantidad desperdiciada
  unit_of_measure: 'kg',
  unit_cost: 2.50,  // Costo unitario del material
  notes: 'Harina de maíz vencida - Lote #ABC123'
});
```

**Request Body para Desperdicio de Material:**
```json
{
  "idmaterial": "uuid-del-material",
  "transaction_type": "waste",
  "quantity": 10.0,
  "unit_of_measure": "kg",
  "unit_cost": 2.50,
  "total_cost": 25.0,
  "notes": "Harina de maíz vencida - Lote #ABC123"
}
```

**Ejemplo 3: Desperdicio sin Costo (Solo Registro)**

```javascript
// Registrar desperdicio sin especificar costo (solo para registro)
const desperdicioSinCosto = await crearTransaccion(token, {
  idfinal_product: 'uuid-producto',
  transaction_type: 'waste',
  quantity: 5.0,
  unit_of_measure: 'un',
  notes: 'Productos con defectos de empaque - Descartados'
});
```

**Ejemplo 4: Función Helper para Registrar Desperdicios**

```javascript
class GestorDesperdicios {
  constructor(clienteProduccion) {
    this.cliente = clienteProduccion;
  }

  // Registrar desperdicio de producto
  async registrarDesperdicioProducto(productoId, cantidad, unidad, costoUnitario, motivo) {
    return await this.cliente.crearTransaccion({
      idfinal_product: productoId,
      transaction_type: 'waste',
      quantity: cantidad,
      unit_of_measure: unidad,
      unit_cost: costoUnitario,
      notes: `Desperdicio: ${motivo}`
    });
  }

  // Registrar desperdicio de material
  async registrarDesperdicioMaterial(materialId, cantidad, unidad, costoUnitario, motivo) {
    return await this.cliente.crearTransaccion({
      idmaterial: materialId,
      transaction_type: 'waste',
      quantity: cantidad,
      unit_of_measure: unidad,
      unit_cost: costoUnitario,
      notes: `Desperdicio: ${motivo}`
    });
  }

  // Registrar múltiples desperdicios en lote
  async registrarDesperdiciosEnLote(desperdicios) {
    const resultados = {
      exitosos: 0,
      fallidos: 0,
      errores: []
    };

    for (const desperdicio of desperdicios) {
      try {
        await this.cliente.crearTransaccion({
          idfinal_product: desperdicio.productoId,
          idmaterial: desperdicio.materialId,
          transaction_type: 'waste',
          quantity: desperdicio.cantidad,
          unit_of_measure: desperdicio.unidad,
          unit_cost: desperdicio.costoUnitario,
          notes: desperdicio.motivo
        });
        resultados.exitosos++;
      } catch (error) {
        resultados.fallidos++;
        resultados.errores.push({
          desperdicio,
          error: error.message
        });
      }
    }

    return resultados;
  }
}

// Uso del gestor
const gestor = new GestorDesperdicios(cliente);

// Registrar desperdicio de producto
await gestor.registrarDesperdicioProducto(
  'uuid-producto',
  25.5,
  'kg',
  3.50,
  'Producto dañado durante transporte'
);

// Registrar desperdicio de material
await gestor.registrarDesperdicioMaterial(
  'uuid-material',
  10.0,
  'kg',
  2.50,
  'Material vencido'
);

// Registrar múltiples desperdicios
const resultados = await gestor.registrarDesperdiciosEnLote([
  {
    productoId: 'uuid-producto-1',
    cantidad: 15.0,
    unidad: 'kg',
    costoUnitario: 3.50,
    motivo: 'Producto dañado'
  },
  {
    materialId: 'uuid-material-1',
    cantidad: 5.0,
    unidad: 'kg',
    costoUnitario: 2.50,
    motivo: 'Material contaminado'
  }
]);
```

**Ejemplo 5: Casos de Uso Comunes de Desperdicios**

```javascript
// Caso 1: Producto dañado durante producción
const desperdicioProduccion = await crearTransaccion(token, {
  idfinal_product: 'uuid-producto',
  transaction_type: 'waste',
  quantity: 2.5,
  unit_of_measure: 'kg',
  unit_cost: 3.50,
  notes: 'Producto quemado durante proceso de fritura - Máquina #3'
});

// Caso 2: Material vencido
const desperdicioVencido = await crearTransaccion(token, {
  idmaterial: 'uuid-material',
  transaction_type: 'waste',
  quantity: 20.0,
  unit_of_measure: 'kg',
  unit_cost: 2.50,
  notes: 'Harina de maíz vencida - Fecha vencimiento: 2024-01-10'
});

// Caso 3: Producto con defecto de calidad
const desperdicioCalidad = await crearTransaccion(token, {
  idfinal_product: 'uuid-producto',
  transaction_type: 'waste',
  quantity: 10.0,
  unit_of_measure: 'un',
  unit_cost: 0.50,
  notes: 'Productos rechazados en control de calidad - Defecto de empaque'
});

// Caso 4: Material contaminado
const desperdicioContaminado = await crearTransaccion(token, {
  idmaterial: 'uuid-material',
  transaction_type: 'waste',
  quantity: 15.0,
  unit_of_measure: 'lt',
  unit_cost: 3.75,
  notes: 'Aceite vegetal contaminado - Lote #XYZ789'
});

// Caso 5: Pérdida por derrame o accidente
const desperdicioAccidente = await crearTransaccion(token, {
  idmaterial: 'uuid-material',
  transaction_type: 'waste',
  quantity: 5.0,
  unit_of_measure: 'lt',
  unit_cost: 3.75,
  notes: 'Derrame accidental durante manipulación - Área de almacén'
});
```

**Response Exitosa para Desperdicio (201 Created):**
```json
{
  "success": true,
  "data": {
    "idtransaction": "uuid-transaccion-desperdicio",
    "iduser": "uuid-del-usuario",
    "idfinal_product": "uuid-del-producto",
    "idmaterial": null,
    "transaction_type": "waste",
    "quantity": "25.5",
    "unit_of_measure": "kg",
    "unit_cost": "3.50",
    "total_cost": "89.25",
    "transaction_date": "2024-01-15T10:30:00.000Z",
    "notes": "Producto dañado durante el transporte - Lote #12345",
    "isactive": true,
    "creationdate": "2024-01-15T10:30:00.000Z",
    "modificationdate": "2024-01-15T10:30:00.000Z"
  },
  "message": "Transacción creada exitosamente",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Notas Importantes sobre Desperdicios:**

1. ✅ **Cantidad**: La cantidad debe ser un número positivo (el sistema interpreta que es una pérdida)
2. ✅ **Producto o Material**: Debes especificar al menos uno de `idfinal_product` o `idmaterial`
3. ✅ **Costo Opcional**: El `unit_cost` y `total_cost` son opcionales, pero recomendados para análisis de costos
4. ✅ **Notas**: Es muy recomendable incluir notas detalladas sobre el motivo del desperdicio para auditoría
5. ✅ **Auditoría**: Los desperdicios se registran como transacciones históricas para análisis y reportes

---

---

### 2. Obtener Transacciones

#### Endpoint: `GET /production/transactions`

**Descripción**: Obtiene las transacciones de inventario con filtros opcionales y paginación.

**Query Parameters:**
- `page` (opcional, number, default: 1): Número de página
- `limit` (opcional, number, default: 10): Cantidad de registros por página
- `type` (opcional, string): Filtrar por tipo de transacción
- `startDate` (opcional, string, ISO 8601): Fecha de inicio del rango
- `endDate` (opcional, string, ISO 8601): Fecha de fin del rango

**Ejemplo de Request:**
```
GET /production/transactions?type=production&startDate=2024-01-01&endDate=2024-01-31&page=1&limit=20
```

**Ejemplo de Request para Desperdicios:**
```
GET /production/transactions?type=waste&startDate=2024-01-01&endDate=2024-01-31&page=1&limit=20
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "idtransaction": "uuid-transaccion-1",
      "iduser": "uuid-usuario-1",
      "idfinal_product": "uuid-producto-1",
      "transaction_type": "production",
      "quantity": "150.5",
      "unit_of_measure": "kg",
      "unit_cost": "2.50",
      "total_cost": "376.25",
      "transaction_date": "2024-01-15T08:00:00.000Z",
      "notes": "Producción registrada",
      "isactive": true,
      "creationdate": "2024-01-15T08:05:00.000Z",
      "nameuser": "Juan Pérez",
      "product_name": "Snack de Maíz",
      "sku": "SNK-001",
      "material_name": null,
      "material_code": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código para Consultar Desperdicios

```javascript
async function obtenerDesperdicios(token, filtros = {}) {
  const params = new URLSearchParams();
  
  // Siempre filtrar por tipo waste
  params.append('type', 'waste');
  
  if (filtros.startDate) params.append('startDate', filtros.startDate);
  if (filtros.endDate) params.append('endDate', filtros.endDate);
  if (filtros.page) params.append('page', filtros.page.toString());
  if (filtros.limit) params.append('limit', filtros.limit.toString());

  const url = `https://tu-funcion-app.azurewebsites.net/api/production/transactions?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al obtener desperdicios');
  }

  return result;
}

// Uso: Obtener desperdicios del mes
const desperdicios = await obtenerDesperdicios(token, {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  page: 1,
  limit: 50
});

// Calcular total de desperdicios
const totalDesperdiciado = desperdicios.data.reduce((sum, desperdicio) => {
  return sum + parseFloat(desperdicio.quantity || 0);
}, 0);

const costoTotalDesperdicios = desperdicios.data.reduce((sum, desperdicio) => {
  return sum + parseFloat(desperdicio.total_cost || 0);
}, 0);

console.log(`Total desperdiciado: ${totalDesperdiciado}`);
console.log(`Costo total de desperdicios: $${costoTotalDesperdicios}`);
```

---

## Ejemplos de Integración

### Ejemplo Completo: Cliente de Producción

```javascript
class ClienteProduccion {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP Error: ${response.status}`);
    }

    return response.json();
  }

  // Registrar producción diaria
  async registrarProduccion(datos) {
    const result = await this.request('/production/register', {
      method: 'POST',
      body: JSON.stringify(datos)
    });
    return result.data;
  }

  // Obtener producción con filtros
  async obtenerProduccion(filtros = {}) {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const result = await this.request(`/production/daily?${params.toString()}`, {
      method: 'GET'
    });
    return result;
  }

  // Obtener estadísticas
  async obtenerEstadisticas(startDate, endDate) {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const result = await this.request(`/production/stats?${params.toString()}`, {
      method: 'GET'
    });
    return result.data;
  }

  // Actualizar producción
  async actualizarProduccion(produccionId, cambios) {
    const result = await this.request(`/production/${produccionId}`, {
      method: 'PUT',
      body: JSON.stringify(cambios)
    });
    return result.data;
  }

  // Crear transacción
  async crearTransaccion(datos) {
    const result = await this.request('/production/transaction', {
      method: 'POST',
      body: JSON.stringify(datos)
    });
    return result.data;
  }

  // Obtener transacciones
  async obtenerTransacciones(filtros = {}) {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const result = await this.request(`/production/transactions?${params.toString()}`, {
      method: 'GET'
    });
    return result;
  }
}

// Uso del cliente
const cliente = new ClienteProduccion(
  'https://tu-funcion-app.azurewebsites.net/api',
  token
);

// Registrar producción
const produccion = await cliente.registrarProduccion({
  idfinal_product: 'uuid-producto',
  production_date: new Date().toISOString(),
  quantity_produced: 150.5,
  unit_of_measure: 'kg',
  notes: 'Producción del turno matutino'
});

// Obtener producción del mes
const produccionMensual = await cliente.obtenerProduccion({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  page: 1,
  limit: 50
});

// Obtener estadísticas
const estadisticas = await cliente.obtenerEstadisticas('2024-01-01', '2024-01-31');
```

---

### Ejemplo: Sincronización desde Sistema de Producción

```javascript
class SincronizadorProduccion {
  constructor(clienteProduccion, sistemaExterno) {
    this.cliente = clienteProduccion;
    this.sistemaExterno = sistemaExterno;
  }

  async sincronizarProduccionDelDia(fecha) {
    try {
      // 1. Obtener producción del sistema externo
      const produccionExterna = await this.sistemaExterno.obtenerProduccionDelDia(fecha);

      // 2. Obtener producción registrada en Nubestock
      const produccionNubestock = await this.cliente.obtenerProduccion({
        startDate: fecha,
        endDate: fecha,
        limit: 1000
      });

      // 3. Comparar y sincronizar
      const resultados = {
        agregadas: 0,
        actualizadas: 0,
        errores: []
      };

      for (const registroExterno of produccionExterna) {
        // Buscar si ya existe en Nubestock
        const existe = produccionNubestock.data.find(
          registro => registro.external_id === registroExterno.id
        );

        try {
          if (existe) {
            // Actualizar si cambió la cantidad
            if (parseFloat(existe.quantity_produced) !== registroExterno.cantidad) {
              await this.cliente.actualizarProduccion(existe.iddaily_production, {
                quantity_produced: registroExterno.cantidad,
                notes: `Sincronizado desde sistema externo - ${new Date().toISOString()}`
              });
              resultados.actualizadas++;
            }
          } else {
            // Agregar nuevo registro
            await this.cliente.registrarProduccion({
              idfinal_product: registroExterno.producto_id_nubestock,
              production_date: registroExterno.fecha,
              quantity_produced: registroExterno.cantidad,
              unit_of_measure: registroExterno.unidad,
              notes: `Sincronizado desde sistema externo - ID: ${registroExterno.id}`
            });
            resultados.agregadas++;
          }
        } catch (error) {
          resultados.errores.push({
            registro: registroExterno,
            error: error.message
          });
        }
      }

      return resultados;
    } catch (error) {
      console.error('Error en sincronización:', error);
      throw error;
    }
  }
}
```

---

## Manejo de Errores

### Códigos de Estado HTTP

- **200 OK**: Operación exitosa
- **201 Created**: Recurso creado exitosamente
- **400 Bad Request**: Error en los datos enviados
- **401 Unauthorized**: Token inválido o ausente
- **403 Forbidden**: Usuario sin permisos suficientes
- **404 Not Found**: Recurso no encontrado
- **500 Internal Server Error**: Error interno del servidor
- **503 Service Unavailable**: Error de conexión con la base de datos

### Manejo de Errores Recomendado

```javascript
async function registrarProduccionConReintentos(token, datos, maxReintentos = 3) {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      return await registrarProduccion(token, datos);
    } catch (error) {
      if (intento === maxReintentos) {
        throw error;
      }

      // Si es error de red o 5xx, reintentar
      if (error.message.includes('Network') || 
          error.message.includes('503') ||
          error.message.includes('500')) {
        await new Promise(resolve => setTimeout(resolve, 1000 * intento));
        continue;
      }

      // Si es error de cliente (4xx), no reintentar
      throw error;
    }
  }
}
```

---

## Mejores Prácticas

### 1. Validación de Datos

```javascript
function validarDatosProduccion(datos) {
  const errores = [];

  if (!datos.idfinal_product) {
    errores.push('El ID del producto es requerido');
  }

  if (!datos.production_date) {
    errores.push('La fecha de producción es requerida');
  }

  if (!datos.quantity_produced || datos.quantity_produced <= 0) {
    errores.push('La cantidad producida debe ser mayor a 0');
  }

  if (!datos.unit_of_measure || datos.unit_of_measure.length < 2) {
    errores.push('La unidad de medida es requerida (mínimo 2 caracteres)');
  }

  return errores;
}
```

### 2. Registro de Producción en Lotes

```javascript
async function registrarProduccionEnLotes(token, registros, tamanoLote = 10) {
  const resultados = {
    exitosos: 0,
    fallidos: 0,
    errores: []
  };

  for (let i = 0; i < registros.length; i += tamanoLote) {
    const lote = registros.slice(i, i + tamanoLote);
    
    const promesas = lote.map(registro => 
      registrarProduccion(token, registro)
        .then(() => resultados.exitosos++)
        .catch(error => {
          resultados.fallidos++;
          resultados.errores.push({ registro, error: error.message });
        })
    );

    await Promise.all(promesas);

    // Pausa entre lotes para no sobrecargar
    if (i + tamanoLote < registros.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return resultados;
}
```

### 3. Caché de Productos

```javascript
class CacheProductos {
  constructor(cliente) {
    this.cliente = cliente;
    this.cache = new Map();
    this.expiry = 5 * 60 * 1000; // 5 minutos
  }

  async obtenerProducto(productId) {
    const cached = this.cache.get(productId);
    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    const producto = await this.cliente.obtenerProducto(productId);
    this.cache.set(productId, {
      data: producto,
      expiry: Date.now() + this.expiry
    });

    return producto;
  }

  invalidar(productId) {
    this.cache.delete(productId);
  }
}
```

---

## Preguntas Frecuentes (FAQ)

### ¿Qué pasa cuando registro producción?

Cuando registras producción usando `POST /production/register`, el sistema:
1. Crea un registro de producción diaria
2. Crea automáticamente una transacción de inventario tipo 'production'
3. Actualiza o registra el device_token del usuario (si se proporciona)

### ¿Puedo registrar producción con fecha pasada?

Sí, puedes registrar producción con cualquier fecha usando el campo `production_date`. Úsalo para corregir registros históricos o registrar producción que no se registró en el momento.

### ¿Cómo obtengo el ID del producto (`idfinal_product`)?

Debes obtener los productos disponibles usando:
```
GET /products
```
Este endpoint retorna la lista de productos con sus IDs que puedes usar al registrar producción.

### ¿Qué tipos de transacciones puedo crear?

Puedes crear transacciones de tipo:
- `purchase`: Compra de materiales/productos
- `production`: Producción de productos (se crea automáticamente al registrar producción)
- `sale`: Venta de productos
- `waste`: Desperdicio o pérdida
- `adjustment`: Ajuste de inventario

### ¿Las transacciones afectan el inventario automáticamente?

No directamente. Las transacciones son registros históricos de movimientos. Para actualizar el inventario, debes usar los endpoints específicos de inventario o productos.

### ¿Puedo actualizar la fecha de producción después de registrarla?

No, la fecha de producción (`production_date`) no se puede modificar después de crear el registro. Si necesitas corregir la fecha, debes crear un nuevo registro con la fecha correcta y desactivar el anterior (si el sistema lo permite).

### ¿Hay límite en la cantidad de producción que puedo registrar?

No hay un límite técnico estricto, pero es recomendable registrar producción en lotes razonables (típicamente menos de 100 registros por lote) para facilitar la gestión y evitar sobrecargar el sistema.

### ¿Cómo registro desperdicios?

Los desperdicios se registran usando el endpoint `POST /production/transaction` con `transaction_type: 'waste'`. Puedes registrar desperdicios de productos finales o materiales.

**Ejemplo de Desperdicio de Producto:**
```javascript
await crearTransaccion(token, {
  idfinal_product: 'uuid-producto',
  transaction_type: 'waste',
  quantity: 25.5,
  unit_of_measure: 'kg',
  unit_cost: 3.50,
  notes: 'Producto dañado durante transporte'
});
```

**Ejemplo de Desperdicio de Material:**
```javascript
await crearTransaccion(token, {
  idmaterial: 'uuid-material',
  transaction_type: 'waste',
  quantity: 10.0,
  unit_of_measure: 'kg',
  unit_cost: 2.50,
  notes: 'Material vencido'
});
```

### ¿Cómo consulto los desperdicios registrados?

Puedes consultar los desperdicios usando el endpoint `GET /production/transactions` con el filtro `type=waste`:

```javascript
// Obtener todos los desperdicios del mes
const desperdicios = await obtenerTransacciones(token, {
  type: 'waste',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  page: 1,
  limit: 50
});
```

### ¿La cantidad en desperdicios debe ser positiva o negativa?

La cantidad en desperdicios debe ser **positiva**. El sistema interpreta que es una pérdida basándose en el `transaction_type: 'waste'`. Por ejemplo, si desperdicias 25.5 kg, envías `quantity: 25.5` (positivo).

### ¿Es obligatorio incluir el costo en los desperdicios?

No es obligatorio, pero es **altamente recomendable** incluir `unit_cost` y `total_cost` para poder realizar análisis de costos de desperdicios y reportes financieros. Si no incluyes el costo, el sistema solo registrará la cantidad desperdiciada.

---

## Soporte

Para soporte técnico o preguntas sobre la integración:

- **Email**: soporte@nubestock.com
- **Documentación**: [docs.nubestock.com](https://docs.nubestock.com)
- **Issues**: [GitHub Issues](https://github.com/nubestock/backend/issues)

---

**Última actualización**: Enero 2024
**Versión de la API**: 1.0.0

