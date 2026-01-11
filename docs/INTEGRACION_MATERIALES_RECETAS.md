# Documentación de Integración - Materiales y Recetas

## Tabla de Contenidos
1. [Introducción](#introducción)
2. [Autenticación](#autenticación)
3. [Configuración Base](#configuración-base)
4. [API de Materiales](#api-de-materiales)
5. [API de Recetas](#api-de-recetas)
6. [Ejemplos de Integración](#ejemplos-de-integración)
7. [Manejo de Errores](#manejo-de-errores)
8. [Mejores Prácticas](#mejores-prácticas)

---

## Introducción

Esta documentación describe cómo integrar un sistema externo con la API de Nubestock para gestionar materiales y recetas. El sistema utiliza Azure Functions con autenticación JWT y un sistema de permisos basado en roles.

### Endpoints Principales

- **Base URL**: `https://tu-funcion-app.azurewebsites.net/api` (Producción)
- **Base URL Local**: `http://localhost:7071/api` (Desarrollo)
- **Autenticación**: JWT Bearer Token
- **Formato de Respuesta**: JSON

---

## Autenticación

### 1. Obtener Token de Acceso

Antes de realizar cualquier operación, debes autenticarte y obtener un token JWT.

#### Endpoint: `POST /auth/login`

**Request:**
```json
{
  "email": "usuario@ejemplo.com",
  "password": "tu_contraseña"
}
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "iduser": "uuid-del-usuario",
      "nameuser": "Nombre Usuario",
      "email": "usuario@ejemplo.com",
      "roles": ["produccion", "inventory"],
      "permissions": ["products_write", "inventory_manage", "products_read"]
    }
  },
  "message": "Login exitoso",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Error (401 Unauthorized):**
```json
{
  "success": false,
  "message": "Credenciales inválidas",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código (JavaScript/TypeScript)

```javascript
async function obtenerToken(email, password) {
  const response = await fetch('https://tu-funcion-app.azurewebsites.net/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: email,
      password: password
    })
  });

  if (!response.ok) {
    throw new Error('Error en autenticación');
  }

  const data = await response.json();
  return data.data.token;
}
```

### 2. Usar el Token en las Peticiones

Todas las peticiones a los endpoints de materiales y recetas requieren el header `Authorization` con el token obtenido:

```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};
```

### 3. Permisos Requeridos

Para crear/actualizar materiales y recetas, el usuario debe tener uno de los siguientes permisos:
- `products_write`
- `inventory_manage`

Para leer materiales y recetas, el usuario debe tener uno de los siguientes permisos:
- `products_read`
- `inventory_manage`
- `production_read`

---

## Configuración Base

### Configuración de Cliente HTTP

Ejemplo de configuración base para realizar peticiones:

```javascript
class NubestockClient {
  constructor(baseUrl, token = null) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP Error: ${response.status}`);
    }

    return response.json();
  }

  setToken(token) {
    this.token = token;
  }
}

// Uso
const client = new NubestockClient('https://tu-funcion-app.azurewebsites.net/api');
await client.setToken(token);
```

---

## API de Materiales

### 1. Crear Material Individual

#### Endpoint: `POST /products/material`

**Descripción**: Crea un nuevo material (materia prima o empaque) en el sistema.

**Request Body:**
```json
{
  "material_name": "Harina de Maíz",
  "material_code": "MAT-001",
  "material_type": "raw",
  "unit_of_measure": "kg",
  "cost_per_unit": 2.50,
  "idorigin": "uuid-del-origen",
  "minimum_stock": 100,
  "supplier": "Proveedor ABC S.A."
}
```

**Campos Requeridos:**
- `material_name` (string, 2-200 caracteres): Nombre del material
- `material_code` (string, 2-50 caracteres): Código único del material
- `material_type` (string, enum: 'raw' | 'packaging'): Tipo de material
  - `raw`: Materia prima
  - `packaging`: Material de empaque
- `unit_of_measure` (string): Unidad de medida (ej: "kg", "lt", "un")
- `cost_per_unit` (number, positivo): Costo por unidad
- `idorigin` (UUID): ID del origen/proveedor

**Campos Opcionales:**
- `minimum_stock` (number, mínimo 0): Stock mínimo, default: 0
- `supplier` (string): Nombre del proveedor

**Response Exitosa (201 Created):**
```json
{
  "success": true,
  "data": {
    "idmaterial": "uuid-del-material",
    "material_name": "Harina de Maíz",
    "material_code": "MAT-001",
    "material_type": "raw",
    "unit_of_measure": "kg",
    "cost_per_unit": "2.50",
    "idorigin": "uuid-del-origen",
    "minimum_stock": "100",
    "supplier": "Proveedor ABC S.A.",
    "isactive": true,
    "creationdate": "2024-01-15T10:30:00.000Z",
    "modificationdate": "2024-01-15T10:30:00.000Z"
  },
  "message": "Material creado exitosamente",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Error (400 Bad Request):**
```json
{
  "success": false,
  "message": "El material ya existe",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function crearMaterial(token, materialData) {
  const response = await fetch('https://tu-funcion-app.azurewebsites.net/api/products/material', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(materialData)
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al crear material');
  }

  return result.data;
}

// Uso
const material = await crearMaterial(token, {
  material_name: "Harina de Maíz",
  material_code: "MAT-001",
  material_type: "raw",
  unit_of_measure: "kg",
  cost_per_unit: 2.50,
  idorigin: "uuid-del-origen",
  minimum_stock: 100,
  supplier: "Proveedor ABC S.A."
});
```

---

### 2. Crear Materiales en Lote (Bulk)

#### Endpoint: `POST /products/materials/bulk`

**Descripción**: Crea múltiples materiales en una sola petición. Máximo 1000 materiales por lote.

**Request Body:**
```json
[
  {
    "material_name": "Harina de Maíz",
    "material_code": "MAT-001",
    "material_type": "raw",
    "unit_of_measure": "kg",
    "cost_per_unit": 2.50,
    "idorigin": "uuid-del-origen-1",
    "minimum_stock": 100,
    "supplier": "Proveedor ABC S.A."
  },
  {
    "material_name": "Aceite Vegetal",
    "material_code": "MAT-002",
    "material_type": "raw",
    "unit_of_measure": "lt",
    "cost_per_unit": 3.75,
    "idorigin": "uuid-del-origen-2",
    "minimum_stock": 50,
    "supplier": "Proveedor XYZ S.A."
  },
  {
    "material_name": "Bolsa Plástica 500g",
    "material_code": "EMP-001",
    "material_type": "packaging",
    "unit_of_measure": "un",
    "cost_per_unit": 0.15,
    "idorigin": "uuid-del-origen-3",
    "minimum_stock": 1000,
    "supplier": "Empaques S.A."
  }
]
```

**Importante**: El body debe ser un array directamente, no un objeto con una propiedad.

**Response Exitosa (201 Created) - Todos Exitosos:**
```json
{
  "success": true,
  "message": "Se procesaron 3 material(es) exitosamente",
  "data": {
    "total": 3,
    "created": 2,
    "updated": 1,
    "failed": 0,
    "materials": [
      {
        "idmaterial": "uuid-1",
        "material_name": "Harina de Maíz",
        "material_code": "MAT-001",
        ...
      },
      ...
    ],
    "errors": []
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Parcial (207 Multi-Status) - Algunos Fallaron:**
```json
{
  "success": false,
  "message": "Se procesaron 2 material(es), 1 fallaron",
  "data": {
    "total": 3,
    "created": 1,
    "updated": 1,
    "failed": 1,
    "materials": [
      {
        "idmaterial": "uuid-1",
        "material_name": "Harina de Maíz",
        ...
      }
    ],
    "errors": [
      {
        "index": 3,
        "material_code": "MAT-003",
        "material_name": "Material Duplicado",
        "error": "El material ya existe"
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Comportamiento Especial**:
- Si un material con el mismo `material_code` ya existe, se **actualiza** en lugar de crear uno nuevo.
- Los materiales duplicados dentro del mismo lote se marcan como fallidos.
- La operación es transaccional: si hay un error crítico, se revierten todos los cambios.

#### Ejemplo de Código

```javascript
async function crearMaterialesBulk(token, materiales) {
  const response = await fetch('https://tu-funcion-app.azurewebsites.net/api/products/materials/bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(materiales) // Array directo
  });

  const result = await response.json();
  
  // Status 207 indica que algunos fallaron pero otros tuvieron éxito
  if (result.data.failed > 0) {
    console.warn(`${result.data.failed} materiales fallaron:`, result.data.errors);
  }

  return result.data;
}

// Uso
const materiales = [
  {
    material_name: "Harina de Maíz",
    material_code: "MAT-001",
    material_type: "raw",
    unit_of_measure: "kg",
    cost_per_unit: 2.50,
    idorigin: "uuid-del-origen",
    minimum_stock: 100
  },
  {
    material_name: "Aceite Vegetal",
    material_code: "MAT-002",
    material_type: "raw",
    unit_of_measure: "lt",
    cost_per_unit: 3.75,
    idorigin: "uuid-del-origen",
    minimum_stock: 50
  }
];

const resultado = await crearMaterialesBulk(token, materiales);
console.log(`Creados: ${resultado.created}, Actualizados: ${resultado.updated}, Fallidos: ${resultado.failed}`);
```

---

### 3. Obtener Materiales

#### Endpoint: `GET /products/materials`

**Descripción**: Obtiene la lista de materiales activos. Soporta filtros opcionales.

**Query Parameters:**
- `type` (opcional, string): Filtro por tipo ('raw' o 'packaging')
- `idorigin` (opcional, UUID): Filtro por origen

**Ejemplo de Request:**
```
GET /products/materials?type=raw&idorigin=uuid-del-origen
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "idmaterial": "uuid-1",
      "material_name": "Harina de Maíz",
      "material_code": "MAT-001",
      "material_type": "raw",
      "unit_of_measure": "kg",
      "cost_per_unit": "2.50",
      "idorigin": "uuid-del-origen",
      "minimum_stock": "100",
      "supplier": "Proveedor ABC S.A.",
      "isactive": true,
      "creationdate": "2024-01-15T10:30:00.000Z",
      "modificationdate": "2024-01-15T10:30:00.000Z"
    },
    ...
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function obtenerMateriales(token, filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.type) params.append('type', filtros.type);
  if (filtros.idorigin) params.append('idorigin', filtros.idorigin);

  const url = `https://tu-funcion-app.azurewebsites.net/api/products/materials${params.toString() ? '?' + params.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  return result.data;
}

// Uso
const materialesRaw = await obtenerMateriales(token, { type: 'raw' });
const materialesPorOrigen = await obtenerMateriales(token, { idorigin: 'uuid-del-origen' });
```

---

### 4. Actualizar Material

#### Endpoint: `PUT /products/material?id={idmaterial}`

**Descripción**: Actualiza un material existente. Todos los campos son opcionales, solo se actualizan los proporcionados.

**Query Parameters:**
- `id` (requerido, UUID): ID del material a actualizar

**Request Body:**
```json
{
  "material_name": "Harina de Maíz Premium",
  "cost_per_unit": 2.75,
  "minimum_stock": 150
}
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": {
    "idmaterial": "uuid-del-material",
    "material_name": "Harina de Maíz Premium",
    "material_code": "MAT-001",
    "material_type": "raw",
    "unit_of_measure": "kg",
    "cost_per_unit": "2.75",
    "idorigin": "uuid-del-origen",
    "minimum_stock": "150",
    "supplier": "Proveedor ABC S.A.",
    "isactive": true,
    "creationdate": "2024-01-15T10:30:00.000Z",
    "modificationdate": "2024-01-15T10:35:00.000Z"
  },
  "message": "Material actualizado exitosamente",
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function actualizarMaterial(token, materialId, cambios) {
  const response = await fetch(`https://tu-funcion-app.azurewebsites.net/api/products/material?id=${materialId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(cambios)
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al actualizar material');
  }

  return result.data;
}

// Uso
const materialActualizado = await actualizarMaterial(token, 'uuid-del-material', {
  cost_per_unit: 2.75,
  minimum_stock: 150
});
```

---

### 5. Eliminar Material (Soft Delete)

#### Endpoint: `DELETE /products/material?id={idmaterial}`

**Descripción**: Desactiva un material (soft delete). No se elimina físicamente de la base de datos.

**Query Parameters:**
- `id` (requerido, UUID): ID del material a eliminar

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Material desactivado exitosamente",
  "timestamp": "2024-01-15T10:40:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function eliminarMaterial(token, materialId) {
  const response = await fetch(`https://tu-funcion-app.azurewebsites.net/api/products/material?id=${materialId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al eliminar material');
  }

  return result;
}
```

---

## API de Recetas

### 1. Crear Receta

#### Endpoint: `POST /products/recipe`

**Descripción**: Crea una receta asociando materiales a un producto final. Una receta puede contener múltiples materiales con sus respectivas cantidades.

**Request Body:**
```json
{
  "idfinal_product": "uuid-del-producto-final",
  "materials": [
    {
      "idmaterial": "uuid-material-1",
      "quantity": 2.5
    },
    {
      "idmaterial": "uuid-material-2",
      "quantity": 1.0
    },
    {
      "idmaterial": "uuid-material-3",
      "quantity": 0.5
    }
  ]
}
```

**Campos Requeridos:**
- `idfinal_product` (UUID): ID del producto final al que se asocia la receta
- `materials` (array, mínimo 1 elemento): Array de materiales que componen la receta
  - `idmaterial` (UUID): ID del material
  - `quantity` (number, positivo): Cantidad del material requerida

**Validaciones:**
- El producto final debe existir y estar activo
- Todos los materiales deben existir y estar activos
- No puede existir una receta duplicada (mismo producto + mismo material)

**Response Exitosa (201 Created):**
```json
{
  "success": true,
  "data": [
    {
      "idrecipe": "uuid-receta-1",
      "idfinal_product": "uuid-del-producto-final",
      "idmaterial": "uuid-material-1",
      "quantity": "2.5",
      "isactive": true,
      "creationdate": "2024-01-15T10:30:00.000Z",
      "modificationdate": "2024-01-15T10:30:00.000Z"
    },
    {
      "idrecipe": "uuid-receta-2",
      "idfinal_product": "uuid-del-producto-final",
      "idmaterial": "uuid-material-2",
      "quantity": "1.0",
      "isactive": true,
      "creationdate": "2024-01-15T10:30:00.000Z",
      "modificationdate": "2024-01-15T10:30:00.000Z"
    },
    {
      "idrecipe": "uuid-receta-3",
      "idfinal_product": "uuid-del-producto-final",
      "idmaterial": "uuid-material-3",
      "quantity": "0.5",
      "isactive": true,
      "creationdate": "2024-01-15T10:30:00.000Z",
      "modificationdate": "2024-01-15T10:30:00.000Z"
    }
  ],
  "message": "3 receta(s) creada(s) exitosamente",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Error (400 Bad Request) - Material no encontrado:**
```json
{
  "success": false,
  "message": "Algunos materiales no existen o están inactivos",
  "missingMaterials": ["uuid-material-no-existe"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Error (400 Bad Request) - Receta duplicada:**
```json
{
  "success": false,
  "message": "Algunas recetas ya existen para este producto",
  "existingMaterials": ["uuid-material-1"],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Response Error (404 Not Found) - Producto no encontrado:**
```json
{
  "success": false,
  "message": "Producto no encontrado",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function crearReceta(token, productoId, materiales) {
  const response = await fetch('https://tu-funcion-app.azurewebsites.net/api/products/recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      idfinal_product: productoId,
      materials: materiales
    })
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al crear receta');
  }

  return result.data;
}

// Uso
const receta = await crearReceta(token, 'uuid-del-producto-final', [
  {
    idmaterial: 'uuid-material-1',
    quantity: 2.5
  },
  {
    idmaterial: 'uuid-material-2',
    quantity: 1.0
  },
  {
    idmaterial: 'uuid-material-3',
    quantity: 0.5
  }
]);

console.log(`Receta creada con ${receta.length} materiales`);
```

---

### 2. Obtener Recetas

#### Endpoint: `GET /products/recipes`

**Descripción**: Obtiene todas las recetas del sistema, agrupadas por producto. Soporta filtro opcional por producto.

**Query Parameters:**
- `productId` (opcional, UUID): Filtrar recetas por producto específico

**Ejemplo de Request:**
```
GET /products/recipes?productId=uuid-del-producto
```

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "idfinal_product": "uuid-producto-1",
      "product_name": "Snack de Maíz",
      "sku": "SNK-001",
      "materials": [
        {
          "idrecipe": "uuid-receta-1",
          "idmaterial": "uuid-material-1",
          "material_name": "Harina de Maíz",
          "material_code": "MAT-001",
          "material_type": "raw",
          "unit_of_measure": "kg",
          "cost_per_unit": 2.5,
          "quantity": 2.5,
          "isactive": true,
          "creationdate": "2024-01-15T10:30:00.000Z",
          "modificationdate": "2024-01-15T10:30:00.000Z"
        },
        {
          "idrecipe": "uuid-receta-2",
          "idmaterial": "uuid-material-2",
          "material_name": "Aceite Vegetal",
          "material_code": "MAT-002",
          "material_type": "raw",
          "unit_of_measure": "lt",
          "cost_per_unit": 3.75,
          "quantity": 1.0,
          "isactive": true,
          "creationdate": "2024-01-15T10:30:00.000Z",
          "modificationdate": "2024-01-15T10:30:00.000Z"
        }
      ]
    },
    {
      "idfinal_product": "uuid-producto-2",
      "product_name": "Snack de Yuca",
      "sku": "SNK-002",
      "materials": [...]
    }
  ],
  "count": 2,
  "totalRecipes": 2,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function obtenerRecetas(token, productId = null) {
  const url = productId 
    ? `https://tu-funcion-app.azurewebsites.net/api/products/recipes?productId=${productId}`
    : 'https://tu-funcion-app.azurewebsites.net/api/products/recipes';
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  return result.data;
}

// Uso - Obtener todas las recetas
const todasLasRecetas = await obtenerRecetas(token);

// Uso - Obtener receta de un producto específico
const recetaProducto = await obtenerRecetas(token, 'uuid-del-producto');
```

---

### 3. Actualizar Receta

#### Endpoint: `PUT /products/recipe?id={idrecipe}`

**Descripción**: Actualiza una receta específica. Solo se pueden actualizar la cantidad y el estado activo.

**Query Parameters:**
- `id` (requerido, UUID): ID de la receta a actualizar

**Request Body:**
```json
{
  "quantity": 3.0,
  "isactive": true
}
```

**Campos Opcionales:**
- `quantity` (number, positivo): Nueva cantidad del material
- `isactive` (boolean): Estado activo/inactivo de la receta

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "data": {
    "idrecipe": "uuid-receta-1",
    "idfinal_product": "uuid-del-producto-final",
    "idmaterial": "uuid-material-1",
    "quantity": "3.0",
    "isactive": true,
    "creationdate": "2024-01-15T10:30:00.000Z",
    "modificationdate": "2024-01-15T10:35:00.000Z"
  },
  "message": "Receta actualizada exitosamente",
  "timestamp": "2024-01-15T10:35:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function actualizarReceta(token, recetaId, cambios) {
  const response = await fetch(`https://tu-funcion-app.azurewebsites.net/api/products/recipe?id=${recetaId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(cambios)
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al actualizar receta');
  }

  return result.data;
}

// Uso
const recetaActualizada = await actualizarReceta(token, 'uuid-receta-1', {
  quantity: 3.0
});
```

---

### 3.1. Actualizar Receta Completa de un Producto (Recomendado)

#### Endpoint: `PUT /products/recipe/update-product`

**Descripción**: Actualiza la receta completa de un producto en una sola operación. Permite:
- ✅ **Agregar** nuevos materiales a la receta
- ✅ **Modificar** la cantidad de materiales existentes
- ✅ **Quitar** materiales que ya no deben estar en la receta (soft delete)
- ✅ Hacer todos estos cambios en una sola petición transaccional

Este es el método recomendado para actualizar recetas porque gestiona todos los cambios en una sola operación.

**Request Body:**
```json
{
  "idfinal_product": "uuid-del-producto-final",
  "materials": [
    {
      "idmaterial": "uuid-material-1",
      "quantity": 3.0
    },
    {
      "idmaterial": "uuid-material-2",
      "quantity": 1.5
    },
    {
      "idmaterial": "uuid-material-3",
      "quantity": 0.8
    }
  ]
}
```

**Campos Requeridos:**
- `idfinal_product` (UUID): ID del producto final cuya receta se va a actualizar
- `materials` (array): Array con la lista completa de materiales que deben estar en la receta
  - `idmaterial` (UUID): ID del material
  - `quantity` (number, positivo): Cantidad del material requerida

**Cómo Funciona:**
1. El sistema compara los materiales enviados con los materiales actuales de la receta
2. **Agrega** los materiales nuevos que no existen
3. **Actualiza** la cantidad de los materiales existentes si cambió
4. **Quita** (soft delete) los materiales que no están en la lista enviada

**Nota Importante**: Debes enviar la lista **completa** de materiales que quieres que tenga la receta. Los materiales que no estén en esta lista serán removidos.

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Receta actualizada: 2 agregado(s), 1 actualizado(s), 1 eliminado(s)",
  "data": {
    "product_id": "uuid-del-producto-final",
    "changes": {
      "added": 2,
      "updated": 1,
      "removed": 1
    },
    "details": {
      "added": [
        {
          "idrecipe": "uuid-receta-nueva-1",
          "idmaterial": "uuid-material-3",
          "quantity": 0.8
        },
        {
          "idrecipe": "uuid-receta-nueva-2",
          "idmaterial": "uuid-material-4",
          "quantity": 0.5
        }
      ],
      "updated": [
        {
          "idrecipe": "uuid-receta-existente-1",
          "idmaterial": "uuid-material-1",
          "oldQuantity": 2.5,
          "newQuantity": 3.0
        }
      ],
      "removed": [
        {
          "idrecipe": "uuid-receta-eliminada-1",
          "idmaterial": "uuid-material-antiguo",
          "quantity": 1.0
        }
      ]
    },
    "current_recipe": [
      {
        "idrecipe": "uuid-receta-1",
        "idmaterial": "uuid-material-1",
        "material_name": "Harina de Maíz",
        "material_code": "MAT-001",
        "material_type": "raw",
        "quantity": 3.0
      },
      {
        "idrecipe": "uuid-receta-2",
        "idmaterial": "uuid-material-2",
        "material_name": "Aceite Vegetal",
        "material_code": "MAT-002",
        "material_type": "raw",
        "quantity": 1.5
      },
      {
        "idrecipe": "uuid-receta-3",
        "idmaterial": "uuid-material-3",
        "material_name": "Sal",
        "material_code": "MAT-003",
        "material_type": "raw",
        "quantity": 0.8
      }
    ],
    "errors": []
  },
  "timestamp": "2024-01-15T11:30:00.000Z"
}
```

**Response Parcial (207 Multi-Status) - Algunos Errores:**
```json
{
  "success": false,
  "message": "Receta actualizada: 1 agregado(s), 1 actualizado(s), 0 eliminado(s)",
  "data": {
    "product_id": "uuid-del-producto-final",
    "changes": {
      "added": 1,
      "updated": 1,
      "removed": 0
    },
    "details": {
      "added": [...],
      "updated": [...],
      "removed": []
    },
    "current_recipe": [...],
    "errors": [
      {
        "idmaterial": "uuid-material-invalido",
        "operation": "add",
        "error": "Material no encontrado o inactivo"
      }
    ]
  },
  "timestamp": "2024-01-15T11:30:00.000Z"
}
```

#### Ejemplos de Código

**Ejemplo 1: Actualizar Receta Completa**

```javascript
async function actualizarRecetaCompleta(token, productoId, materiales) {
  const response = await fetch(
    'https://tu-funcion-app.azurewebsites.net/api/products/recipe/update-product',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        idfinal_product: productoId,
        materials: materiales
      })
    }
  );

  const result = await response.json();
  
  // Status 207 indica que algunos cambios tuvieron éxito pero hubo errores
  if (result.data.errors && result.data.errors.length > 0) {
    console.warn('Algunos errores en la actualización:', result.data.errors);
  }

  return result.data;
}

// Uso: Actualizar receta completa
const materialesActualizados = await actualizarRecetaCompleta(
  token,
  'uuid-del-producto',
  [
    { idmaterial: 'uuid-material-1', quantity: 3.0 },  // Actualizar cantidad
    { idmaterial: 'uuid-material-2', quantity: 1.5 },  // Mantener o actualizar
    { idmaterial: 'uuid-material-3', quantity: 0.8 }   // Agregar nuevo
    // Cualquier material no incluido aquí será removido
  ]
);

console.log(`Cambios: ${materialesActualizados.changes.added} agregados, ${materialesActualizados.changes.updated} actualizados, ${materialesActualizados.changes.removed} removidos`);
```

**Ejemplo 2: Agregar un Material a la Receta Existente**

```javascript
async function agregarMaterialAReceta(token, productoId, nuevoMaterial) {
  // 1. Obtener la receta actual
  const recetasResponse = await fetch(
    `https://tu-funcion-app.azurewebsites.net/api/products/recipes?productId=${productoId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const recetasData = await recetasResponse.json();
  const recetaActual = recetasData.data[0]; // Primer producto (debería ser el solicitado)
  
  // 2. Agregar el nuevo material a la lista existente
  const materialesActualizados = [
    ...recetaActual.materials.map(m => ({
      idmaterial: m.idmaterial,
      quantity: m.quantity
    })),
    nuevoMaterial // Agregar el nuevo material
  ];
  
  // 3. Actualizar la receta completa
  return await actualizarRecetaCompleta(token, productoId, materialesActualizados);
}

// Uso: Agregar un nuevo material
await agregarMaterialAReceta(
  token,
  'uuid-del-producto',
  { idmaterial: 'uuid-material-nuevo', quantity: 0.5 }
);
```

**Ejemplo 3: Quitar un Material de la Receta**

```javascript
async function quitarMaterialDeReceta(token, productoId, materialIdAQuitar) {
  // 1. Obtener la receta actual
  const recetasResponse = await fetch(
    `https://tu-funcion-app.azurewebsites.net/api/products/recipes?productId=${productoId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const recetasData = await recetasResponse.json();
  const recetaActual = recetasData.data[0];
  
  // 2. Filtrar el material que queremos quitar
  const materialesActualizados = recetaActual.materials
    .filter(m => m.idmaterial !== materialIdAQuitar) // Quitar el material
    .map(m => ({
      idmaterial: m.idmaterial,
      quantity: m.quantity
    }));
  
  // 3. Actualizar la receta completa (sin el material removido)
  return await actualizarRecetaCompleta(token, productoId, materialesActualizados);
}

// Uso: Quitar un material
await quitarMaterialDeReceta(
  token,
  'uuid-del-producto',
  'uuid-material-a-quitar'
);
```

**Ejemplo 4: Modificar la Cantidad de un Material**

```javascript
async function modificarCantidadMaterial(token, productoId, materialId, nuevaCantidad) {
  // 1. Obtener la receta actual
  const recetasResponse = await fetch(
    `https://tu-funcion-app.azurewebsites.net/api/products/recipes?productId=${productoId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  const recetasData = await recetasResponse.json();
  const recetaActual = recetasData.data[0];
  
  // 2. Actualizar la cantidad del material específico
  const materialesActualizados = recetaActual.materials.map(m => ({
    idmaterial: m.idmaterial,
    quantity: m.idmaterial === materialId ? nuevaCantidad : m.quantity
  }));
  
  // 3. Actualizar la receta completa
  return await actualizarRecetaCompleta(token, productoId, materialesActualizados);
}

// Uso: Modificar cantidad de un material
await modificarCantidadMaterial(
  token,
  'uuid-del-producto',
  'uuid-material-1',
  3.5  // Nueva cantidad
);
```

**Ejemplo 5: Clase Helper para Gestión de Recetas**

```javascript
class GestorRecetas {
  constructor(token, baseUrl) {
    this.token = token;
    this.baseUrl = baseUrl;
  }

  async obtenerReceta(productoId) {
    const response = await fetch(
      `${this.baseUrl}/products/recipes?productId=${productoId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`
        }
      }
    );
    
    const result = await response.json();
    return result.data[0] || null; // Retorna la receta del producto
  }

  async actualizarRecetaCompleta(productoId, materiales) {
    const response = await fetch(
      `${this.baseUrl}/products/recipe/update-product`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({
          idfinal_product: productoId,
          materials: materiales
        })
      }
    );

    const result = await response.json();
    return result.data;
  }

  async agregarMaterial(productoId, nuevoMaterial) {
    const receta = await this.obtenerReceta(productoId);
    if (!receta) throw new Error('Producto no encontrado');

    const materiales = [
      ...receta.materials.map(m => ({
        idmaterial: m.idmaterial,
        quantity: m.quantity
      })),
      nuevoMaterial
    ];

    return await this.actualizarRecetaCompleta(productoId, materiales);
  }

  async quitarMaterial(productoId, materialId) {
    const receta = await this.obtenerReceta(productoId);
    if (!receta) throw new Error('Producto no encontrado');

    const materiales = receta.materials
      .filter(m => m.idmaterial !== materialId)
      .map(m => ({
        idmaterial: m.idmaterial,
        quantity: m.quantity
      }));

    return await this.actualizarRecetaCompleta(productoId, materiales);
  }

  async modificarCantidad(productoId, materialId, nuevaCantidad) {
    const receta = await this.obtenerReceta(productoId);
    if (!receta) throw new Error('Producto no encontrado');

    const materiales = receta.materials.map(m => ({
      idmaterial: m.idmaterial,
      quantity: m.idmaterial === materialId ? nuevaCantidad : m.quantity
    }));

    return await this.actualizarRecetaCompleta(productoId, materiales);
  }

  async actualizarMultiples(productoId, cambios) {
    // cambios = [{ action: 'add'|'update'|'remove', idmaterial, quantity? }]
    const receta = await this.obtenerReceta(productoId);
    if (!receta) throw new Error('Producto no encontrado');

    let materiales = receta.materials.map(m => ({
      idmaterial: m.idmaterial,
      quantity: m.quantity
    }));

    for (const cambio of cambios) {
      if (cambio.action === 'add') {
        materiales.push({
          idmaterial: cambio.idmaterial,
          quantity: cambio.quantity
        });
      } else if (cambio.action === 'update') {
        const index = materiales.findIndex(m => m.idmaterial === cambio.idmaterial);
        if (index >= 0) {
          materiales[index].quantity = cambio.quantity;
        }
      } else if (cambio.action === 'remove') {
        materiales = materiales.filter(m => m.idmaterial !== cambio.idmaterial);
      }
    }

    return await this.actualizarRecetaCompleta(productoId, materiales);
  }
}

// Uso del gestor
const gestor = new GestorRecetas(
  token,
  'https://tu-funcion-app.azurewebsites.net/api'
);

// Agregar material
await gestor.agregarMaterial('uuid-producto', {
  idmaterial: 'uuid-material-nuevo',
  quantity: 0.5
});

// Quitar material
await gestor.quitarMaterial('uuid-producto', 'uuid-material-a-quitar');

// Modificar cantidad
await gestor.modificarCantidad('uuid-producto', 'uuid-material-1', 3.5);

// Múltiples operaciones a la vez
await gestor.actualizarMultiples('uuid-producto', [
  { action: 'add', idmaterial: 'uuid-material-1', quantity: 2.0 },
  { action: 'update', idmaterial: 'uuid-material-2', quantity: 1.5 },
  { action: 'remove', idmaterial: 'uuid-material-3' }
]);
```

---

### 4. Eliminar Receta (Soft Delete)

#### Endpoint: `DELETE /products/recipe?id={idrecipe}`

**Descripción**: Desactiva una receta (soft delete). No se elimina físicamente.

**Query Parameters:**
- `id` (requerido, UUID): ID de la receta a eliminar

**Response Exitosa (200 OK):**
```json
{
  "success": true,
  "message": "Receta eliminada exitosamente",
  "timestamp": "2024-01-15T10:40:00.000Z"
}
```

#### Ejemplo de Código

```javascript
async function eliminarReceta(token, recetaId) {
  const response = await fetch(`https://tu-funcion-app.azurewebsites.net/api/products/recipe?id=${recetaId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.message || 'Error al eliminar receta');
  }

  return result;
}
```

---

## Ejemplos de Integración

### Ejemplo Completo: Sincronización de Materiales desde ERP

Este ejemplo muestra cómo sincronizar materiales desde un sistema ERP externo hacia Nubestock:

```javascript
class NubestockIntegracion {
  constructor(baseUrl, email, password) {
    this.baseUrl = baseUrl;
    this.email = email;
    this.password = password;
    this.token = null;
    this.tokenExpiry = null;
  }

  // Autenticación con renovación automática
  async authenticate() {
    // Si el token aún es válido, no hacer nada
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: this.email,
        password: this.password
      })
    });

    if (!response.ok) {
      throw new Error('Error en autenticación');
    }

    const data = await response.json();
    this.token = data.data.token;
    
    // Asumir que el token expira en 24 horas (ajustar según tu configuración)
    this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    return this.token;
  }

  async request(endpoint, options = {}) {
    await this.authenticate(); // Asegurar que tenemos token válido

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers
      }
    });

    if (response.status === 401) {
      // Token expirado, intentar re-autenticar
      this.token = null;
      await this.authenticate();
      
      // Reintentar la petición
      return fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          ...options.headers
        }
      }).then(res => res.json());
    }

    return response.json();
  }

  // Sincronizar materiales desde ERP
  async sincronizarMateriales(materialesERP) {
    try {
      // Transformar datos del ERP al formato de Nubestock
      const materialesNubestock = materialesERP.map(material => ({
        material_name: material.nombre,
        material_code: material.codigo,
        material_type: material.tipo === 'Materia Prima' ? 'raw' : 'packaging',
        unit_of_measure: material.unidad,
        cost_per_unit: material.costoUnitario,
        idorigin: material.origenId, // Asegurar que este ID existe en Nubestock
        minimum_stock: material.stockMinimo || 0,
        supplier: material.proveedor || null
      }));

      // Enviar en lotes de 100 para evitar sobrecarga
      const batchSize = 100;
      const resultados = {
        total: materialesNubestock.length,
        creados: 0,
        actualizados: 0,
        fallidos: 0,
        errores: []
      };

      for (let i = 0; i < materialesNubestock.length; i += batchSize) {
        const batch = materialesNubestock.slice(i, i + batchSize);
        
        try {
          const resultado = await this.request('/products/materials/bulk', {
            method: 'POST',
            body: JSON.stringify(batch)
          });

          resultados.creados += resultado.data.created || 0;
          resultados.actualizados += resultado.data.updated || 0;
          resultados.fallidos += resultado.data.failed || 0;
          
          if (resultado.data.errors) {
            resultados.errores.push(...resultado.data.errors);
          }

          // Pequeña pausa entre lotes para no sobrecargar el servidor
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error en lote ${i / batchSize + 1}:`, error);
          resultados.fallidos += batch.length;
        }
      }

      return resultados;
    } catch (error) {
      console.error('Error en sincronización:', error);
      throw error;
    }
  }

  // Crear receta completa
  async crearRecetaCompleta(productoId, materialesReceta) {
    try {
      // Verificar que todos los materiales existen
      const materialesExistentes = await this.request('/products/materials');
      const codigosExistentes = new Set(
        materialesExistentes.data.map(m => m.material_code)
      );

      const materialesInvalidos = materialesReceta.filter(
        m => !codigosExistentes.has(m.codigo)
      );

      if (materialesInvalidos.length > 0) {
        throw new Error(
          `Los siguientes materiales no existen: ${materialesInvalidos.map(m => m.codigo).join(', ')}`
        );
      }

      // Mapear códigos a IDs
      const materialesConIds = materialesReceta.map(m => {
        const material = materialesExistentes.data.find(
          mat => mat.material_code === m.codigo
        );
        return {
          idmaterial: material.idmaterial,
          quantity: m.cantidad
        };
      });

      // Crear la receta
      const resultado = await this.request('/products/recipe', {
        method: 'POST',
        body: JSON.stringify({
          idfinal_product: productoId,
          materials: materialesConIds
        })
      });

      return resultado.data;
    } catch (error) {
      console.error('Error al crear receta:', error);
      throw error;
    }
  }
}

// Uso del cliente de integración
const cliente = new NubestockIntegracion(
  'https://tu-funcion-app.azurewebsites.net/api',
  'usuario@ejemplo.com',
  'contraseña_segura'
);

// Sincronizar materiales
const materialesERP = [
  {
    nombre: 'Harina de Maíz',
    codigo: 'MAT-001',
    tipo: 'Materia Prima',
    unidad: 'kg',
    costoUnitario: 2.50,
    origenId: 'uuid-origen-1',
    stockMinimo: 100,
    proveedor: 'Proveedor ABC'
  },
  // ... más materiales
];

const resultadoSincronizacion = await cliente.sincronizarMateriales(materialesERP);
console.log('Resultado:', resultadoSincronizacion);

// Crear receta
const receta = await cliente.crearRecetaCompleta('uuid-producto', [
  { codigo: 'MAT-001', cantidad: 2.5 },
  { codigo: 'MAT-002', cantidad: 1.0 }
]);
```

---

### Ejemplo: Python

```python
import requests
from typing import List, Dict, Optional
from datetime import datetime, timedelta

class NubestockClient:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip('/')
        self.email = email
        self.password = password
        self.token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None
    
    def authenticate(self) -> str:
        """Autentica y obtiene token JWT"""
        if self.token and self.token_expiry and datetime.now() < self.token_expiry:
            return self.token
        
        response = requests.post(
            f"{self.base_url}/auth/login",
            json={
                "email": self.email,
                "password": self.password
            }
        )
        response.raise_for_status()
        
        data = response.json()
        self.token = data["data"]["token"]
        self.token_expiry = datetime.now() + timedelta(hours=24)
        
        return self.token
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Realiza una petición autenticada"""
        self.authenticate()
        
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.token}"
        headers["Content-Type"] = "application/json"
        
        response = requests.request(
            method,
            f"{self.base_url}{endpoint}",
            headers=headers,
            **kwargs
        )
        
        if response.status_code == 401:
            # Token expirado, re-autenticar
            self.token = None
            self.authenticate()
            headers["Authorization"] = f"Bearer {self.token}"
            response = requests.request(
                method,
                f"{self.base_url}{endpoint}",
                headers=headers,
                **kwargs
            )
        
        response.raise_for_status()
        return response.json()
    
    def crear_material(self, material: Dict) -> Dict:
        """Crea un material individual"""
        result = self._request("POST", "/products/material", json=material)
        return result["data"]
    
    def crear_materiales_bulk(self, materiales: List[Dict]) -> Dict:
        """Crea múltiples materiales en lote"""
        result = self._request("POST", "/products/materials/bulk", json=materiales)
        return result["data"]
    
    def obtener_materiales(self, tipo: Optional[str] = None, 
                          origen_id: Optional[str] = None) -> List[Dict]:
        """Obtiene la lista de materiales"""
        params = {}
        if tipo:
            params["type"] = tipo
        if origen_id:
            params["idorigin"] = origen_id
        
        result = self._request("GET", "/products/materials", params=params)
        return result["data"]
    
    def crear_receta(self, producto_id: str, materiales: List[Dict]) -> List[Dict]:
        """Crea una receta para un producto"""
        payload = {
            "idfinal_product": producto_id,
            "materials": materiales
        }
        result = self._request("POST", "/products/recipe", json=payload)
        return result["data"]
    
    def obtener_recetas(self, producto_id: Optional[str] = None) -> List[Dict]:
        """Obtiene las recetas"""
        params = {}
        if producto_id:
            params["productId"] = producto_id
        
        result = self._request("GET", "/products/recipes", params=params)
        return result["data"]

# Uso
cliente = NubestockClient(
    base_url="https://tu-funcion-app.azurewebsites.net/api",
    email="usuario@ejemplo.com",
    password="contraseña_segura"
)

# Crear material
material = cliente.crear_material({
    "material_name": "Harina de Maíz",
    "material_code": "MAT-001",
    "material_type": "raw",
    "unit_of_measure": "kg",
    "cost_per_unit": 2.50,
    "idorigin": "uuid-origen",
    "minimum_stock": 100
})

# Crear materiales en lote
materiales = cliente.crear_materiales_bulk([
    {
        "material_name": "Harina de Maíz",
        "material_code": "MAT-001",
        "material_type": "raw",
        "unit_of_measure": "kg",
        "cost_per_unit": 2.50,
        "idorigin": "uuid-origen",
        "minimum_stock": 100
    },
    # ... más materiales
])

# Crear receta
receta = cliente.crear_receta("uuid-producto", [
    {"idmaterial": "uuid-material-1", "quantity": 2.5},
    {"idmaterial": "uuid-material-2", "quantity": 1.0}
])
```

---

## Manejo de Errores

### Códigos de Estado HTTP

- **200 OK**: Operación exitosa
- **201 Created**: Recurso creado exitosamente
- **207 Multi-Status**: Operación parcialmente exitosa (algunos elementos fallaron)
- **400 Bad Request**: Error en los datos enviados
- **401 Unauthorized**: Token inválido o ausente
- **403 Forbidden**: Usuario sin permisos suficientes
- **404 Not Found**: Recurso no encontrado
- **500 Internal Server Error**: Error interno del servidor

### Estructura de Error

```json
{
  "success": false,
  "message": "Descripción del error",
  "errors": [
    {
      "field": "material_code",
      "message": "El código de material ya existe"
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Manejo de Errores Recomendado

```javascript
async function manejarPeticionConReintentos(fn, maxReintentos = 3) {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      return await fn();
    } catch (error) {
      if (intento === maxReintentos) {
        throw error;
      }

      // Si es error de red o 5xx, reintentar
      if (error instanceof TypeError || 
          (error.response && error.response.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, 1000 * intento));
        continue;
      }

      // Si es error de cliente (4xx), no reintentar
      throw error;
    }
  }
}

// Uso
try {
  const material = await manejarPeticionConReintentos(() =>
    crearMaterial(token, materialData)
  );
} catch (error) {
  if (error.response) {
    const errorData = error.response.data;
    console.error('Error del servidor:', errorData.message);
    
    if (errorData.errors) {
      errorData.errors.forEach(err => {
        console.error(`- ${err.field}: ${err.message}`);
      });
    }
  } else {
    console.error('Error de red:', error.message);
  }
}
```

---

## Mejores Prácticas

### 1. Gestión de Tokens

- **Cachear el token**: No autenticarse en cada petición
- **Renovar antes de expirar**: Verificar la expiración y renovar proactivamente
- **Manejar 401**: Implementar lógica de re-autenticación automática

```javascript
class TokenManager {
  constructor(authenticateFn) {
    this.authenticateFn = authenticateFn;
    this.token = null;
    this.expiry = null;
  }

  async getToken() {
    if (!this.token || this.isExpired()) {
      this.token = await this.authenticateFn();
      this.expiry = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23 horas
    }
    return this.token;
  }

  isExpired() {
    return !this.expiry || new Date() >= this.expiry;
  }

  invalidate() {
    this.token = null;
    this.expiry = null;
  }
}
```

### 2. Validación de Datos

Valida los datos antes de enviarlos al servidor:

```javascript
function validarMaterial(material) {
  const errores = [];

  if (!material.material_name || material.material_name.length < 2) {
    errores.push('El nombre del material es requerido (mínimo 2 caracteres)');
  }

  if (!material.material_code || material.material_code.length < 2) {
    errores.push('El código del material es requerido (mínimo 2 caracteres)');
  }

  if (!['raw', 'packaging'].includes(material.material_type)) {
    errores.push('El tipo de material debe ser "raw" o "packaging"');
  }

  if (!material.cost_per_unit || material.cost_per_unit <= 0) {
    errores.push('El costo por unidad debe ser mayor a 0');
  }

  if (!material.idorigin) {
    errores.push('El ID de origen es requerido');
  }

  return errores;
}
```

### 3. Procesamiento en Lotes

Para grandes volúmenes de datos, procesa en lotes:

```javascript
async function procesarEnLotes(items, procesarLote, tamanoLote = 100) {
  const resultados = {
    exitosos: 0,
    fallidos: 0,
    errores: []
  };

  for (let i = 0; i < items.length; i += tamanoLote) {
    const lote = items.slice(i, i + tamanoLote);
    
    try {
      const resultado = await procesarLote(lote);
      resultados.exitosos += resultado.exitosos || lote.length;
      resultados.fallidos += resultado.fallidos || 0;
      
      if (resultado.errores) {
        resultados.errores.push(...resultado.errores);
      }
    } catch (error) {
      resultados.fallidos += lote.length;
      resultados.errores.push({
        lote: i / tamanoLote + 1,
        error: error.message
      });
    }

    // Pausa entre lotes para no sobrecargar
    if (i + tamanoLote < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return resultados;
}
```

### 4. Logging y Monitoreo

Implementa logging adecuado para rastrear las operaciones:

```javascript
class Logger {
  log(level, mensaje, datos = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      mensaje,
      ...datos
    };
    
    console.log(JSON.stringify(logEntry));
    
    // Aquí podrías enviar a un servicio de logging externo
    // await enviarALoggingExterno(logEntry);
  }

  info(mensaje, datos) {
    this.log('INFO', mensaje, datos);
  }

  error(mensaje, datos) {
    this.log('ERROR', mensaje, datos);
  }

  warn(mensaje, datos) {
    this.log('WARN', mensaje, datos);
  }
}

const logger = new Logger();

// Uso
logger.info('Iniciando sincronización de materiales', { cantidad: materiales.length });
try {
  const resultado = await sincronizarMateriales(materiales);
  logger.info('Sincronización completada', resultado);
} catch (error) {
  logger.error('Error en sincronización', { error: error.message, stack: error.stack });
}
```

### 5. Rate Limiting

Implementa límites de tasa para evitar sobrecargar el servidor:

```javascript
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async waitIfNeeded() {
    const now = Date.now();
    
    // Eliminar requests antiguos fuera de la ventana
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const tiempoEspera = this.windowMs - (now - this.requests[0]);
      await new Promise(resolve => setTimeout(resolve, tiempoEspera));
      this.requests.shift();
    }
    
    this.requests.push(now);
  }
}

// Uso: máximo 100 requests por minuto
const rateLimiter = new RateLimiter(100, 60 * 1000);

async function peticionConRateLimit(fn) {
  await rateLimiter.waitIfNeeded();
  return fn();
}
```

---

## Resumen: Cuándo Usar Cada Método de Actualización de Recetas

### Comparación de Métodos

| Método | Endpoint | Cuándo Usarlo | Operaciones Permitidas |
|--------|----------|---------------|----------------------|
| **Actualizar Receta Individual** | `PUT /products/recipe?id={idrecipe}` | Solo cambiar la cantidad de un material específico | Modificar cantidad de un material |
| **Actualizar Receta Completa** ⭐ | `PUT /products/recipe/update-product` | Cambios múltiples en una receta | Agregar, quitar y modificar múltiples materiales |
| **Eliminar Receta Individual** | `DELETE /products/recipe?id={idrecipe}` | Solo quitar un material específico | Quitar un material |
| **Crear Receta** | `POST /products/recipe` | Crear una nueva receta desde cero | Crear receta nueva con materiales |

### ⭐ Recomendación: Usar Actualización Completa

El método **`PUT /products/recipe/update-product`** es el recomendado para la mayoría de los casos porque:

✅ **Operación atómica**: Todos los cambios se realizan en una sola transacción  
✅ **Más eficiente**: Una sola petición HTTP en lugar de múltiples  
✅ **Menos errores**: Evita inconsistencias por peticiones parciales  
✅ **Más flexible**: Permite agregar, quitar y modificar en una sola operación  
✅ **Mejor auditoría**: Un solo registro de cambios

### Guía de Decisión

**Usa `PUT /products/recipe/update-product` cuando:**
- Necesitas agregar uno o más materiales a una receta existente
- Necesitas quitar uno o más materiales de una receta
- Necesitas modificar las cantidades de varios materiales
- Necesitas hacer múltiples cambios en una receta
- Quieres reemplazar completamente la receta de un producto

**Usa `PUT /products/recipe?id={idrecipe}` cuando:**
- Solo necesitas cambiar la cantidad de un material específico
- Conoces el `idrecipe` exacto del material
- Solo estás actualizando un único material

**Usa `DELETE /products/recipe?id={idrecipe}` cuando:**
- Solo necesitas quitar un material específico
- Conoces el `idrecipe` exacto del material
- No necesitas modificar otros materiales

**Usa `POST /products/recipe` cuando:**
- Estás creando una receta nueva desde cero
- El producto aún no tiene materiales asociados

### Ejemplo de Flujo Completo

```javascript
// Flujo recomendado: Actualizar receta completa
async function gestionarRecetaProducto(token, productoId) {
  // 1. Obtener la receta actual
  const receta = await obtenerReceta(token, productoId);
  
  // 2. Modificar la lista de materiales según necesidades
  const materialesActualizados = [
    // Material existente con cantidad modificada
    { idmaterial: receta.materials[0].idmaterial, quantity: 3.5 },
    
    // Material existente sin cambios
    { idmaterial: receta.materials[1].idmaterial, quantity: receta.materials[1].quantity },
    
    // Nuevo material a agregar
    { idmaterial: 'uuid-material-nuevo', quantity: 0.5 }
    
    // Material removido: simplemente no incluirlo en la lista
  ];
  
  // 3. Actualizar receta completa en una sola operación
  const resultado = await actualizarRecetaCompleta(
    token,
    productoId,
    materialesActualizados
  );
  
  console.log(`Receta actualizada: ${resultado.changes.added} agregados, ${resultado.changes.updated} actualizados, ${resultado.changes.removed} removidos`);
  
  return resultado;
}
```

---

## Preguntas Frecuentes (FAQ)

### ¿Cómo obtengo el ID de origen (idorigin)?

Debes obtener los orígenes disponibles usando el endpoint:
```
GET /products/origins
```

Este endpoint retorna la lista de orígenes con sus IDs que puedes usar al crear materiales.

### ¿Qué hacer si un material_code ya existe?

Si envías un material con un `material_code` que ya existe en la operación bulk, el sistema intentará **actualizar** el material existente en lugar de crear uno nuevo. Si usas el endpoint individual (`/products/material`), recibirás un error 400.

### ¿Puedo crear una receta sin materiales?

No, una receta debe tener al menos un material. El campo `materials` es requerido y debe tener mínimo 1 elemento.

### ¿Cómo sé si un producto existe antes de crear una receta?

Puedes verificar la existencia del producto usando:
```
GET /products/{productId}
```

Si el producto no existe, recibirás un 404.

### ¿Los materiales eliminados (soft delete) aparecen en las recetas?

No, los materiales inactivos (`isactive: false`) no aparecen en las listas ni pueden ser usados en nuevas recetas. Las recetas existentes que usan materiales inactivos seguirán existiendo, pero al obtener las recetas, solo verás materiales activos.

### ¿Cómo puedo agregar un material a una receta existente?

**Opción 1 (Recomendada)**: Usa `PUT /products/recipe/update-product` para actualizar la receta completa:

```javascript
// 1. Obtener la receta actual
const receta = await obtenerReceta(token, productoId);

// 2. Agregar el nuevo material a la lista existente
const materialesActualizados = [
  ...receta.materials.map(m => ({ idmaterial: m.idmaterial, quantity: m.quantity })),
  { idmaterial: 'uuid-material-nuevo', quantity: 0.5 } // Nuevo material
];

// 3. Actualizar receta completa
await actualizarRecetaCompleta(token, productoId, materialesActualizados);
```

**Opción 2**: Usa `POST /products/recipe` para agregar materiales a una receta existente (esto agregará los materiales sin afectar los existentes si no están duplicados).

### ¿Cómo puedo quitar un material de una receta?

**Opción 1 (Recomendada)**: Usa `PUT /products/recipe/update-product` y simplemente no incluyas el material en la lista:

```javascript
// 1. Obtener la receta actual
const receta = await obtenerReceta(token, productoId);

// 2. Filtrar el material que quieres quitar
const materialesActualizados = receta.materials
  .filter(m => m.idmaterial !== materialIdAQuitar)
  .map(m => ({ idmaterial: m.idmaterial, quantity: m.quantity }));

// 3. Actualizar receta completa (sin el material removido)
await actualizarRecetaCompleta(token, productoId, materialesActualizados);
```

**Opción 2**: Usa `DELETE /products/recipe?id={idrecipe}` si conoces el `idrecipe` del material específico.

### ¿Cómo puedo modificar la cantidad de un material en una receta?

**Opción 1 (Recomendada)**: Usa `PUT /products/recipe/update-product`:

```javascript
// 1. Obtener la receta actual
const receta = await obtenerReceta(token, productoId);

// 2. Actualizar la cantidad del material específico
const materialesActualizados = receta.materials.map(m => ({
  idmaterial: m.idmaterial,
  quantity: m.idmaterial === materialId ? nuevaCantidad : m.quantity
}));

// 3. Actualizar receta completa
await actualizarRecetaCompleta(token, productoId, materialesActualizados);
```

**Opción 2**: Usa `PUT /products/recipe?id={idrecipe}` si conoces el `idrecipe` exacto del material.

### ¿Qué pasa si envío una lista vacía de materiales en `update-product`?

Si envías un array vacío `[]` en el campo `materials`, **todos los materiales de la receta serán removidos** (soft delete). La receta quedará vacía. Esto es útil si quieres limpiar completamente una receta.

### ¿Puedo hacer cambios parciales en una receta?

Sí, cuando uses `PUT /products/recipe/update-product`, solo necesitas enviar la lista **completa** de materiales que quieres que tenga la receta final. El sistema:
- **Agregará** materiales nuevos que no existían
- **Actualizará** materiales existentes si cambió la cantidad
- **Quitará** materiales que no están en la lista

**Importante**: Debes enviar TODA la lista de materiales que quieres que tenga la receta, no solo los cambios.

### ¿Hay límite en la cantidad de materiales por receta?

No hay un límite técnico estricto, pero es recomendable mantener recetas razonables (típicamente menos de 50 materiales) para facilitar la gestión.

---

## Soporte

Para soporte técnico o preguntas sobre la integración:

- **Email**: soporte@nubestock.com
- **Documentación**: [docs.nubestock.com](https://docs.nubestock.com)
- **Issues**: [GitHub Issues](https://github.com/nubestock/backend/issues)

---

**Última actualización**: Enero 2024
**Versión de la API**: 1.0.0

