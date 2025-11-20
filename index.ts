// Punto de entrada principal para Azure Functions
// Este archivo exporta todas las funciones para que Azure Functions las pueda cargar

export { default as auth } from './auth/index';
export { default as users } from './users/index';
export { default as products } from './products/index';
export { default as production } from './production/index';
export { default as sales } from './sales/index';
export { default as stats } from './stats/index';
