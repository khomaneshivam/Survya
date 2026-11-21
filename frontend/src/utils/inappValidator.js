/**
 * Universal Database-Driven In-App Form Validation Engine (Frontend Mirror)
 * Used for live validation in In-App interactive preview screens and form builders.
 */

export function validateFormSubmission(fields = [], submittedValues = {}) {
  const fieldErrors = {};
  const normalizedValues = {};
  const values = submittedValues && typeof submittedValues === "object" ? submittedValues : {};

  const fieldMap = new Map();
  for (const f of fields) {
    if (f && f.field_key) {
      fieldMap.set(f.field_key, f);
    }
  }

  for (const field of fields) {
    if (!field || !field.field_key) continue;

    const key = field.field_key;
    const label = field.label || key;
    const inputType = String(field.input_type || "TEXT").toUpperCase();
    let rawVal = values[key];

    let rules = {};
    if (typeof field.validation_rules_json === "string") {
      try {
        rules = JSON.parse(field.validation_rules_json || "{}");
      } catch (_e) {
        rules = {};
      }
    } else if (field.validation_rules_json && typeof field.validation_rules_json === "object") {
      rules = field.validation_rules_json;
    }

    const customError = rules.errorMessage || rules.message || null;

    if (typeof rawVal === "string") {
      rawVal = rawVal.trim();
    }

    // 1. Required Check
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

    if (isEmpty) {
      normalizedValues[key] = null;
      continue;
    }

    normalizedValues[key] = rawVal;

    // 2. Email & Phone
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
        } catch (_e) {
          // ignore invalid pattern
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

    // 5. Date Rules
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

    // 6. Allowed Values
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

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    normalizedValues
  };
}
