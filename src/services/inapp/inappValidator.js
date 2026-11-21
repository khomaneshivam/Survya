/**
 * Universal Database-Driven In-App Form Validation Engine
 * Used synchronously on both server API validation and frontend interactive forms.
 * Validates form submission values against inapp_form_fields schemas and validation_rules_json.
 */

/**
 * Universal Form Submission Validator
 * @param {Array<Object>} fields - Array of inapp_form_fields rows
 * @param {Object} submittedValues - Key-value pair of customer submitted values
 * @returns {{ isValid: boolean, fieldErrors: Object, normalizedValues: Object }}
 */
function validateFormSubmission(fields = [], submittedValues = {}) {
  const fieldErrors = {};
  const normalizedValues = {};
  const values = submittedValues && typeof submittedValues === "object" ? submittedValues : {};

  // Build field lookup for cross-field validations (e.g. date_after_field)
  const fieldMap = new Map();
  for (const f of fields) {
    const k = f?.field_key || f?.fieldKey;
    if (k) {
      fieldMap.set(k, f);
    }
  }

  for (const field of fields) {
    const key = field?.field_key || field?.fieldKey;
    if (!key) continue;

    const label = field.label || key;
    const inputType = String(field.input_type || field.inputType || "TEXT").toUpperCase();
    let rawVal = values[key];

    // Parse validation rules from JSON string or object
    let rules = {};
    const rawRules = field.validation_rules_json !== undefined ? field.validation_rules_json : field.validationRules;
    if (typeof rawRules === "string") {
      try {
        rules = JSON.parse(rawRules || "{}");
      } catch (e) {
        rules = {};
      }
    } else if (rawRules && typeof rawRules === "object") {
      rules = rawRules;
    }

    const customError = rules.errorMessage || rules.message || null;

    // Normalization & trimming
    if (typeof rawVal === "string") {
      rawVal = rawVal.trim();
    }

    // 1. Check Required Rule
    const isRequired = Boolean(rules.required) || rules.required === "true";
    const isEmpty =
      rawVal === undefined ||
      rawVal === null ||
      rawVal === "" ||
      (Array.isArray(rawVal) && rawVal.length === 0) ||
      (typeof rawVal === "object" && !Array.isArray(rawVal) && Object.keys(rawVal).length === 0);

    if (isRequired && isEmpty) {
      fieldErrors[key] = customError || `${label} is required`;
      continue;
    }

    // If empty and not required, skip downstream rules
    if (isEmpty) {
      normalizedValues[key] = null;
      continue;
    }

    // Normalized value assignment
    normalizedValues[key] = rawVal;

    // 2. Type-specific & Format Validation
    if (inputType === "EMAIL" || rules.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(rawVal))) {
        fieldErrors[key] = customError || `${label} must be a valid email address`;
        continue;
      }
      normalizedValues[key] = String(rawVal).toLowerCase();
    }

    if (inputType === "PHONE" || rules.phone_e164) {
      const cleanDigits = String(rawVal).replace(/[\s\-().]/g, "");
      const phoneRegex = /^\+?[0-9]{10,15}$/;
      if (!phoneRegex.test(cleanDigits)) {
        fieldErrors[key] = customError || `${label} must be a valid 10-15 digit phone number`;
        continue;
      }
      normalizedValues[key] = cleanDigits;
    }

    if (inputType === "NUMBER") {
      const num = Number(rawVal);
      if (isNaN(num)) {
        fieldErrors[key] = customError || `${label} must be a valid number`;
        continue;
      }
      normalizedValues[key] = num;
      rawVal = num;
    }

    // 3. String Length Rules
    if (typeof rawVal === "string") {
      if (rules.minLength !== undefined && rules.minLength !== null) {
        const minLen = parseInt(rules.minLength, 10);
        if (!isNaN(minLen) && rawVal.length < minLen) {
          fieldErrors[key] = customError || `${label} must be at least ${minLen} characters`;
          continue;
        }
      }

      if (rules.maxLength !== undefined && rules.maxLength !== null) {
        const maxLen = parseInt(rules.maxLength, 10);
        if (!isNaN(maxLen) && rawVal.length > maxLen) {
          fieldErrors[key] = customError || `${label} cannot exceed ${maxLen} characters`;
          continue;
        }
      }

      if (rules.regex) {
        try {
          const reg = new RegExp(rules.regex);
          if (!reg.test(rawVal)) {
            fieldErrors[key] = customError || `${label} format is invalid`;
            continue;
          }
        } catch (e) {
          // Invalid regex in rules config - non-fatal
        }
      }
    }

    // 4. Numeric Range Rules
    if (typeof rawVal === "number" || (!isNaN(Number(rawVal)) && (rules.min !== undefined || rules.max !== undefined))) {
      const numVal = Number(rawVal);
      if (rules.min !== undefined && rules.min !== null) {
        const minVal = Number(rules.min);
        if (!isNaN(minVal) && numVal < minVal) {
          fieldErrors[key] = customError || `${label} must be at least ${minVal}`;
          continue;
        }
      }

      if (rules.max !== undefined && rules.max !== null) {
        const maxVal = Number(rules.max);
        if (!isNaN(maxVal) && numVal > maxVal) {
          fieldErrors[key] = customError || `${label} cannot exceed ${maxVal}`;
          continue;
        }
      }
    }

    // 5. Date Rules (date_min_today, date_after_field)
    if (inputType === "DATE" || inputType === "DATE_RANGE") {
      const dateStr = String(rawVal).split("T")[0];

      if (rules.date_min_today) {
        const todayStr = new Date().toISOString().split("T")[0];
        if (dateStr < todayStr) {
          fieldErrors[key] = customError || `${label} cannot be in the past`;
          continue;
        }
      }

      if (rules.date_after_field) {
        const targetFieldKey = rules.date_after_field;
        const targetRawVal = values[targetFieldKey];
        if (targetRawVal) {
          const targetDateStr = String(targetRawVal).split("T")[0];
          if (dateStr <= targetDateStr) {
            const targetField = fieldMap.get(targetFieldKey);
            const targetLabel = targetField?.label || targetFieldKey;
            fieldErrors[key] = customError || `${label} must be after ${targetLabel}`;
            continue;
          }
        }
      }
    }

    // 6. Allowed Values / Options Check
    if (rules.allowed_values && Array.isArray(rules.allowed_values)) {
      if (Array.isArray(rawVal)) {
        const hasInvalid = rawVal.some(v => !rules.allowed_values.includes(v));
        if (hasInvalid) {
          fieldErrors[key] = customError || `${label} contains an invalid selection`;
          continue;
        }
      } else {
        if (!rules.allowed_values.includes(rawVal)) {
          fieldErrors[key] = customError || `${label} contains an invalid selection`;
          continue;
        }
      }
    }

    // 7. Price Range validation
    if (inputType === "PRICE_RANGE" || rules.price_range) {
      let minP = 0;
      let maxP = 0;
      if (typeof rawVal === "object" && rawVal !== null) {
        minP = Number(rawVal.min || 0);
        maxP = Number(rawVal.max || 0);
      } else if (typeof rawVal === "string" && rawVal.includes("-")) {
        const parts = rawVal.split("-").map(p => Number(p.trim()));
        minP = parts[0] || 0;
        maxP = parts[1] || 0;
      }

      if (isNaN(minP) || isNaN(maxP) || minP < 0 || maxP < 0) {
        fieldErrors[key] = customError || `${label} contains invalid price figures`;
        continue;
      }

      if (minP > maxP) {
        fieldErrors[key] = customError || `${label} minimum price cannot exceed maximum price`;
        continue;
      }

      normalizedValues[key] = { min: minP, max: maxP };
    }
  }

  const isValid = Object.keys(fieldErrors).length === 0;

  return {
    isValid,
    valid: isValid,
    fieldErrors,
    errors: fieldErrors,
    normalizedValues
  };
}

module.exports = {
  validateFormSubmission
};
