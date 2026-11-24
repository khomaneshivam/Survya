/**
 * Template Configuration Validator
 * Validates tenant-provided business values against a template's configSchema.
 */

class TemplateConfigValidator {
  /**
   * Validate configValues against configSchema
   * @param {Object} configSchema - Field definitions e.g. { "business.name": { type: "string", required: true, label: "Business Name" } }
   * @param {Object} configValues - Values entered by tenant e.g. { "business.name": "Konkan Beach Resort" }
   * @returns {{ isValid: boolean, errors: string[], cleanConfig: Object }}
   */
  validate(configSchema = {}, configValues = {}) {
    const errors = [];
    const cleanConfig = {};

    if (!configSchema || typeof configSchema !== 'object') {
      return { isValid: true, errors: [], cleanConfig: configValues || {} };
    }

    // Support flat keys ("business.name") or nested object lookups
    const getValue = (key) => {
      if (configValues[key] !== undefined && configValues[key] !== null) {
        return configValues[key];
      }
      if (key.includes('.')) {
        const parts = key.split('.');
        let curr = configValues;
        for (const p of parts) {
          if (curr == null || typeof curr !== 'object') return undefined;
          curr = curr[p];
        }
        return curr;
      }
      return undefined;
    };

    for (const [key, fieldDef] of Object.entries(configSchema)) {
      const label = fieldDef.label || key;
      let val = getValue(key);

      // Check required
      if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
        if (fieldDef.required) {
          errors.push(`Field '${label}' (${key}) is required.`);
          continue;
        } else {
          // Apply default if provided
          if (fieldDef.default !== undefined) {
            val = fieldDef.default;
          } else {
            continue;
          }
        }
      }

      // Type-specific validations
      const type = String(fieldDef.type || 'string').toLowerCase();
      switch (type) {
        case 'string':
        case 'text':
          if (typeof val !== 'string' && typeof val !== 'number') {
            errors.push(`Field '${label}' must be text.`);
          } else {
            cleanConfig[key] = String(val).trim();
          }
          break;

        case 'phone': {
          const digitsOnly = String(val).replace(/\D/g, '');
          if (digitsOnly.length < 7 || digitsOnly.length > 15) {
            errors.push(`Field '${label}' must be a valid phone number with 7 to 15 digits.`);
          } else {
            cleanConfig[key] = digitsOnly;
          }
          break;
        }

        case 'email': {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(val).trim())) {
            errors.push(`Field '${label}' must be a valid email address.`);
          } else {
            cleanConfig[key] = String(val).trim().toLowerCase();
          }
          break;
        }

        case 'number': {
          const num = Number(val);
          if (isNaN(num)) {
            errors.push(`Field '${label}' must be a numeric value.`);
          } else {
            if (fieldDef.min !== undefined && num < fieldDef.min) {
              errors.push(`Field '${label}' must be at least ${fieldDef.min}.`);
            }
            if (fieldDef.max !== undefined && num > fieldDef.max) {
              errors.push(`Field '${label}' must be at most ${fieldDef.max}.`);
            }
            cleanConfig[key] = num;
          }
          break;
        }

        case 'boolean':
          cleanConfig[key] = Boolean(val);
          break;

        case 'time': {
          // Validate HH:MM format
          const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
          if (!timeRegex.test(String(val).trim())) {
            errors.push(`Field '${label}' must be in 24-hour HH:MM format (e.g. 14:00).`);
          } else {
            cleanConfig[key] = String(val).trim();
          }
          break;
        }

        case 'select': {
          if (Array.isArray(fieldDef.options) && fieldDef.options.length > 0) {
            const allowedValues = fieldDef.options.map(opt => typeof opt === 'object' ? opt.value : opt);
            if (!allowedValues.includes(val)) {
              errors.push(`Field '${label}' value '${val}' is not in allowed options: ${allowedValues.join(', ')}.`);
            } else {
              cleanConfig[key] = val;
            }
          } else {
            cleanConfig[key] = val;
          }
          break;
        }

        default:
          cleanConfig[key] = val;
          break;
      }
    }

    // Preserve any extra user fields provided
    for (const [k, v] of Object.entries(configValues)) {
      if (cleanConfig[k] === undefined && v !== undefined && v !== null) {
        cleanConfig[k] = v;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      cleanConfig
    };
  }
}

module.exports = new TemplateConfigValidator();

