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

    let rules = {};
    const rawRules = field.validation_rules_json !== undefined ? field.validation_rules_json : field.validationRules;
    if (typeof rawRules === "string") {
      try {
        rules = JSON.parse(rawRules || "{}");
      } catch (_e) {
        rules = {};
      }
    } else if (rawRules && typeof rawRules === "object") {
      rules = rawRules;
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
      continue;
    }

    // 2. Length Validations
    if (typeof rawVal === "string") {
      if (rules.minLength !== undefined && rawVal.length < Number(rules.minLength)) {
        fieldErrors[key] = customError || `${label} must be at least ${rules.minLength} characters`;
        continue;
      }
      if (rules.maxLength !== undefined && rawVal.length > Number(rules.maxLength)) {
        fieldErrors[key] = customError || `${label} cannot exceed ${rules.maxLength} characters`;
        continue;
      }
    }

    // 3. Numeric & Range Validations
    if (inputType === "NUMBER" || typeof rawVal === "number" || (!isNaN(Number(rawVal)) && typeof rawVal === "string" && !isNaN(parseFloat(rawVal)))) {
      const num = Number(rawVal);
      if (!isNaN(num)) {
        if (rules.min !== undefined && num < Number(rules.min)) {
          fieldErrors[key] = customError || `${label} must be at least ${rules.min}`;
          continue;
        }
        if (rules.max !== undefined && num > Number(rules.max)) {
          fieldErrors[key] = customError || `${label} cannot exceed ${rules.max}`;
          continue;
        }
        normalizedValues[key] = num;
      }
    } else {
      normalizedValues[key] = rawVal;
    }

    // 4. Format & Regex Checks
    if (rules.regex) {
      try {
        const re = new RegExp(rules.regex);
        if (!re.test(String(rawVal))) {
          fieldErrors[key] = customError || `${label} is invalid`;
          continue;
        }
      } catch (_e) {}
    }

    // 5. Semantic Types
    if (rules.email || inputType === "EMAIL") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(rawVal))) {
        fieldErrors[key] = customError || `Enter a valid email address for ${label}`;
        continue;
      }
    }

    if (rules.phone_e164 || inputType === "TEL" || inputType === "PHONE") {
      const digitsOnly = String(rawVal).replace(/[\s\-().]/g, "");
      if (!/^\+?[0-9]{10,15}$/.test(digitsOnly)) {
        fieldErrors[key] = customError || `Enter a valid 10-15 digit phone number for ${label}`;
        continue;
      }
      normalizedValues[key] = digitsOnly;
    }

    // 6. Date Rules
    if (inputType === "DATE" || rules.date_min_today || rules.date_after_field) {
      const parsed = new Date(rawVal);
      if (isNaN(parsed.getTime())) {
        fieldErrors[key] = customError || `${label} must be a valid date`;
        continue;
      }

      if (rules.date_min_today) {
        const todayUtc = new Date().toISOString().split("T")[0];
        const valDateStr = typeof rawVal === "string" ? rawVal.split("T")[0] : parsed.toISOString().split("T")[0];
        if (valDateStr < todayUtc) {
          fieldErrors[key] = customError || `${label} cannot be in the past`;
          continue;
        }
      }

      if (rules.date_after_field) {
        const priorFieldKey = rules.date_after_field;
        const priorVal = values[priorFieldKey];
        if (priorVal) {
          const priorDate = new Date(priorVal);
          if (!isNaN(priorDate.getTime())) {
            const priorStr = typeof priorVal === "string" ? priorVal.split("T")[0] : priorDate.toISOString().split("T")[0];
            const currentStr = typeof rawVal === "string" ? rawVal.split("T")[0] : parsed.toISOString().split("T")[0];
            if (currentStr <= priorStr) {
              const priorFieldObj = fieldMap.get(priorFieldKey);
              const priorLabel = priorFieldObj?.label || priorFieldKey;
              fieldErrors[key] = customError || `${label} must be after ${priorLabel}`;
              continue;
            }
          }
        }
      }
    }

    // 7. Allowed Values
    if (Array.isArray(rules.allowed_values) && rules.allowed_values.length > 0) {
      if (!rules.allowed_values.includes(rawVal)) {
        fieldErrors[key] = customError || `${label} must be one of: ${rules.allowed_values.join(", ")}`;
        continue;
      }
    }

    // 8. Price Range validation
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

/**
 * Validates a single field
 */
export function validateField(field, value, allValues = {}) {
  const result = validateFormSubmission([field], { ...allValues, [field?.field_key || field?.fieldKey]: value });
  const key = field?.field_key || field?.fieldKey;
  return result.fieldErrors[key] || null;
}
