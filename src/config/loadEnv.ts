/**
 * Script para cargar variables de entorno en Azure Functions
 * Azure Functions Core Tools debería cargar automáticamente local.settings.json,
 * pero este script asegura la carga en desarrollo local
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export const loadLocalSettings = (): void => {
  // Solo cargar en desarrollo local, no en Azure
  if (process.env.AZURE_FUNCTIONS_ENVIRONMENT === 'Production') {
    return; // En producción, Azure carga las variables automáticamente
  }

  try {
    // Intentar múltiples rutas posibles
    const possiblePaths = [
      path.join(process.cwd(), 'local.settings.json'),
      path.resolve(process.cwd(), 'local.settings.json'),
      path.join(__dirname, '../../local.settings.json'),
      path.join(__dirname, '../../../local.settings.json'),
    ];

    let settingsPath: string | null = null;
    
    // Buscar el archivo en las rutas posibles
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        settingsPath = possiblePath;
        break;
      }
    }
    
    if (settingsPath) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      
      // Cargar variables desde local.settings.json
      if (settings.Values) {
        Object.keys(settings.Values).forEach(key => {
          process.env[key] = String(settings.Values[key]);
        });
      }
    }
  } catch (error) {
    logger.error('Error loading local.settings.json:', error);
  }
};

// Cargar local.settings.json al importar este módulo
loadLocalSettings();

