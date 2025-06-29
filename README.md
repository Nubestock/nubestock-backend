# Nubestock Backend

Backend de inventario para Nubestock, desarrollado con **Azure Functions**, **TypeScript** y **Node.js**.

---

## 🚀 Requisitos previos

- **Node.js** >= 18.x
- **npm** >= 8.x (o pnpm/yarn)
- **Azure Functions Core Tools** >= 4.x  
  _Necesario para ejecutar y depurar localmente con `func start`_  
  👉 [Guía de instalación oficial](https://learn.microsoft.com/azure/azure-functions/functions-run-local#install-the-azure-functions-core-tools)

---

## ⚡ Instalación y pasos para desarrollo

1. **Clona el repositorio:**
   ```bash
   git clone <URL-del-repo>
   cd nubestock-backend
   ```

2. **Instala las dependencias:**
   ```bash
   npm install
   ```

3. **Copia y configura las variables de entorno:**
   ```bash
   cp .env.example .env
   # Edita .env según tu entorno
   ```

4. **Compila el proyecto:**
   ```bash
   npm run build
   ```

5. **Inicia el entorno local de Azure Functions:**
   ```bash
   func start
   ```
   > **IMPORTANTE:**  
   > Si recibes un error de comando no encontrado, instala Azure Functions Core Tools con:  
   > `npm install -g azure-functions-core-tools@4 --unsafe-perm true`

---

## 🛠️ Comandos útiles

| Comando         | Acción                                      |
|-----------------|---------------------------------------------|
| npm run build   | Compila el proyecto TypeScript a JavaScript |
| npm run start   | Compila y ejecuta localmente con Azure Func |
| npm run dev     | Hot reload (si lo configuras)               |
| npm test        | Ejecuta los tests                           |

---

## 📁 Estructura general

```
nubestock-backend/
│
├── src/                  # Código fuente (funciones, modelos, rutas, etc.)
│   ├── <funcion>/        # Carpeta por cada Azure Function
│   │   ├── index.ts
│   │   └── function.json
│   └── ...
├── dist/                 # Código compilado (no subir a git)
├── .env.example          # Variables de entorno de ejemplo
├── package.json
├── tsconfig.json
├── host.json
├── local.settings.json   # Configuración local de Azure Functions
└── README.md
```

---

## 📝 Notas

- **Debes tener instalado Azure Functions Core Tools** para usar `func start` y depurar localmente.
- El archivo `local.settings.json` no debe subirse a producción.
- El código fuente está en `src/` y se compila a `dist/`.
- Cada función tiene su propio `function.json` y `index.ts`.

---

## 📚 Más información

- [Documentación oficial de Azure Functions](https://learn.microsoft.com/azure/azure-functions/)
- [Documentación de Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Ejemplo de despliegue continuo con GitHub Actions](https://learn.microsoft.com/azure/azure-functions/functions-how-to-github-actions?tabs=python)
