// Punto de entrada principal para Azure Functions
// Este archivo exporta todas las funciones para que Azure Functions las pueda cargar

// Cargar variables de entorno al inicio
import './src/config/loadEnv';

export { default as auth } from './auth/index';
export { default as users } from './users/index';
export { default as products } from './products/index';
export { default as production } from './production/index';
export { default as sales } from './sales/index';
export { default as stats } from './stats/index';
export { default as healthcheck } from './healthcheck/index';
