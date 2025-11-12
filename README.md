# Nubestock Backend - Sistema de Producción

## 🚀 Descripción

Backend optimizado para el sistema de producción Nubestock, desarrollado con Azure Functions y TypeScript. Este sistema centraliza la gestión de inventario, producción, ventas y alertas para empresas productoras de snacks.

## 🏗️ Arquitectura

### **Tecnologías Principales**
- **Azure Functions** - Serverless computing
- **TypeScript** - Tipado estático
- **PostgreSQL** - Base de datos relacional
- **Knex.js** - Query builder
- **JWT** - Autenticación
- **Winston** - Logging
- **Joi** - Validación

### **Estructura del Proyecto**
```
nubestock-backend-new/
├── src/
│   ├── config/          # Configuración de BD, logging, entorno
│   ├── middleware/      # Autenticación, validación, CORS
│   ├── services/        # Lógica de negocio
│   ├── controllers/     # Controladores de API
│   ├── models/          # Modelos de datos
│   ├── utils/           # Utilidades
│   └── types/           # Tipos TypeScript
├── functions/           # Azure Functions
│   ├── auth/           # Autenticación
│   ├── users/          # Gestión de usuarios
│   ├── products/       # Productos y materiales
│   ├── production/     # Producción diaria
│   ├── sales/          # Ventas y clientes
│   ├── inventory/      # Control de inventario
│   ├── alerts/         # Sistema de alertas
│   ├── machinery/      # Maquinaria y mantenimiento
│   ├── notifications/ # Notificaciones push
│   └── reports/        # Reportes y estadísticas
└── dist/              # Código compilado
```

## 🚀 Instalación y Configuración

### **Prerrequisitos**
- Node.js 18+
- PostgreSQL 12+
- Azure Functions Core Tools
- Azure CLI (opcional)

### **Instalación**
```bash
# Clonar el repositorio
git clone <repository-url>
cd nubestock-backend-new

# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Ejecutar en modo desarrollo
npm run dev
```

### **Configuración de Variables de Entorno**
```bash
# Copiar archivo de configuración
cp local.settings.json.example local.settings.json

# Configurar variables de entorno
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=nubestock
JWT_SECRET=your-super-secret-key
```

## 📊 Base de Datos

### **Esquema Principal: `nubestock`**

#### **Tablas de Usuarios y Roles**
- `tb_mae_user` - Usuarios del sistema
- `tb_mae_role` - Roles de usuario
- `tb_mae_permission` - Permisos del sistema
- `tb_mae_user_role` - Asignación de roles
- `tb_mae_role_permission` - Permisos por rol

#### **Tablas de Productos**
- `tb_mae_category` - Categorías de productos
- `tb_mae_origin` - Orígenes/Provincias
- `tb_mae_material` - Materiales (materia prima y empaque)
- `tb_mae_final_product` - Productos finales
- `tb_mae_product_recipe` - Recetas de productos

#### **Tablas de Operaciones**
- `tb_ope_daily_production` - Producción diaria
- `tb_ope_transaction` - Transacciones de inventario
- `tb_ope_sales` - Ventas
- `tb_ope_sales_detail` - Detalles de ventas

#### **Tablas de Clientes**
- `tb_mae_client` - Clientes

#### **Tablas de Alertas y Notificaciones**
- `tb_mae_alert` - Alertas del sistema
- `tb_mae_device_token` - Tokens de dispositivos
- `tb_mae_notification` - Notificaciones enviadas

#### **Tablas de Maquinaria**
- `tb_mae_machinery` - Maquinaria y mantenimiento

#### **Tablas de Logs**
- `tb_system_logs` - Logs del sistema

## 🔐 Autenticación y Autorización

### **Flujo de Autenticación**
1. **Login** - Credenciales → JWT Token
2. **Refresh Token** - Renovar token de acceso
3. **Logout** - Invalidar token
4. **Cambio de contraseña** - Actualizar credenciales

### **Roles del Sistema**
- **Administrador** - Acceso completo
- **Producción** - Solo registro de producción
- **Provisional** - Acceso limitado

### **Permisos**
- `users:read` - Leer usuarios
- `users:write` - Crear/editar usuarios
- `products:read` - Leer productos
- `products:write` - Crear/editar productos
- `production:read` - Leer producción
- `production:write` - Registrar producción
- `sales:read` - Leer ventas
- `sales:write` - Crear/editar ventas
- `inventory:read` - Leer inventario
- `inventory:write` - Actualizar inventario
- `alerts:read` - Leer alertas
- `alerts:write` - Crear/editar alertas
- `reports:read` - Leer reportes

## 📡 API Endpoints

### **Autenticación**
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
POST /api/auth/logout
POST /api/auth/change-password
POST /api/auth/reset-password
```

### **Usuarios**
```
GET    /api/users/list
GET    /api/users/{id}
POST   /api/users
PUT    /api/users/{id}
DELETE /api/users/{id}
```

### **Productos**
```
GET    /api/products/list
GET    /api/products/{id}
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}
GET    /api/products/categories
GET    /api/products/origins
GET    /api/products/materials
GET    /api/products/recipes
POST   /api/products/recipe
```

### **Producción**
```
GET    /api/production/daily
GET    /api/production/stats
GET    /api/production/transactions
POST   /api/production/register
POST   /api/production/transaction
PUT    /api/production/{id}
```

### **Ventas**
```
GET    /api/sales/list
GET    /api/sales/{id}
POST   /api/sales
PUT    /api/sales/{id}
PUT    /api/sales/payment
GET    /api/sales/clients
POST   /api/sales/client
GET    /api/sales/stats
GET    /api/sales/overdue
```

## 🔔 Sistema de Alertas

### **Tipos de Alertas**
- **Stock Bajo** - Materiales por debajo del umbral
- **Mantenimiento** - Maquinaria próxima a mantenimiento
- **Pagos Vencidos** - Clientes con pagos pendientes
- **Producción** - Alertas de producción diaria

### **Configuración de Alertas**
```typescript
const alertConfig = {
  lowStockThreshold: 10,
  maintenanceAlertDays: 15,
  paymentOverdueDays: 30
};
```

## 📱 Notificaciones Push

### **Configuración**
- **FCM** - Firebase Cloud Messaging (Android)
- **APNS** - Apple Push Notification Service (iOS)

### **Flujo de Notificaciones**
1. **Registro de Token** - Dispositivo registra token
2. **Generación de Alerta** - Sistema detecta condición
3. **Envío de Notificación** - Push a dispositivos
4. **Seguimiento** - Estado de entrega

## 📊 Reportes y Estadísticas

### **Reportes Disponibles**
- **Producción Diaria** - Resumen de producción
- **Ventas por Período** - Análisis de ventas
- **Inventario Actual** - Stock disponible
- **Clientes Morosos** - Pagos pendientes
- **Mantenimiento** - Estado de maquinaria

### **Métricas Clave**
- Total de producción por día/semana/mes
- Ventas por cliente y producto
- Rotación de inventario
- Eficiencia de producción
- Alertas generadas

## 🚀 Despliegue

### **Desarrollo Local**
```bash
# Instalar Azure Functions Core Tools
npm install -g azure-functions-core-tools@4

# Ejecutar localmente
func start
```

### **Despliegue en Azure**
```bash
# Login en Azure
az login

# Crear Function App
az functionapp create --resource-group myResourceGroup --consumption-plan-location westeurope --runtime node --runtime-version 18 --functions-version 4 --name myFunctionApp --storage-account mystorageaccount

# Desplegar
func azure functionapp publish myFunctionApp
```

## 🧪 Testing

### **Ejecutar Tests**
```bash
# Tests unitarios
npm test

# Tests de integración
npm run test:integration

# Coverage
npm run test:coverage
```

## 📝 Logging

### **Niveles de Log**
- **ERROR** - Errores críticos
- **WARN** - Advertencias
- **INFO** - Información general
- **DEBUG** - Información detallada

### **Archivos de Log**
- `logs/error.log` - Solo errores
- `logs/combined.log` - Todos los logs
- `logs/database.log` - Logs de base de datos
- `logs/audit.log` - Logs de auditoría
- `logs/alerts.log` - Logs de alertas

## 🔧 Configuración Avanzada

### **Rate Limiting**
```typescript
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // 100 requests por ventana
};
```

### **CORS**
```typescript
const corsConfig = {
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
};
```

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama para feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- **Email**: support@nubestock.com
- **Documentación**: [docs.nubestock.com](https://docs.nubestock.com)
- **Issues**: [GitHub Issues](https://github.com/nubestock/backend/issues)

---

**Nubestock Backend** - Sistema de Producción Optimizado 🚀
