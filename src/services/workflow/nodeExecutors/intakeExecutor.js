const { interpolateTemplate } = require('../expressionEvaluator');

/**
 * Natural language / robust date parser for guest check-in/check-out and booking inputs
 */
function parseDateInput(inputStr, referenceDate = new Date()) {
  if (!inputStr) return null;
  let raw = String(inputStr).trim().toLowerCase();

  // Strip ordinals: "20th" -> "20", "1st" -> "1", "2nd" -> "2", "3rd" -> "3"
  raw = raw.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, '$1');

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = String(isoMatch[2]).padStart(2, '0');
    const d = String(isoMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    const y = Number(dmyMatch[3]);
    return `${y}-${m}-${d}`;
  }

  // Relative keywords
  const ref = new Date(referenceDate);
  const refYear = ref.getFullYear();
  if (raw === 'today' || raw === 'aaj') {
    return ref.toISOString().split('T')[0];
  }
  if (raw === 'tomorrow' || raw === 'kal') {
    ref.setDate(ref.getDate() + 1);
    return ref.toISOString().split('T')[0];
  }
  if (raw === 'day after tomorrow' || raw === 'parson') {
    ref.setDate(ref.getDate() + 2);
    return ref.toISOString().split('T')[0];
  }

  // Month dictionary
  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  // Pattern: "20 nov", "20 november", "20 nov 2026", "nov 20", "november 20"
  const monthDayMatch = raw.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/) ||
                        raw.match(/^([a-z]+)\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (monthDayMatch) {
    let day, monthStr, yearStr;
    if (/^\d/.test(monthDayMatch[1])) {
      day = Number(monthDayMatch[1]);
      monthStr = monthDayMatch[2];
      yearStr = monthDayMatch[3];
    } else {
      monthStr = monthDayMatch[1];
      day = Number(monthDayMatch[2]);
      yearStr = monthDayMatch[3];
    }
    const monthNum = months[monthStr];
    if (monthNum && day >= 1 && day <= 31) {
      let y = yearStr ? Number(yearStr) : refYear;
      const candidate = new Date(y, monthNum - 1, day);
      if (!yearStr && candidate < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) {
        y += 1;
      }
      const mStr = String(monthNum).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      return `${y}-${mStr}-${dStr}`;
    }
  }

  // DD/MM or DD-MM (without year)
  const dmMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (dmMatch) {
    const d = Number(dmMatch[1]);
    const m = Number(dmMatch[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      let y = refYear;
      const candidate = new Date(y, m - 1, d);
      if (candidate < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) {
        y += 1;
      }
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Fallback: standard Date.parse
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    let y = parsed.getFullYear();
    if (y < refYear) {
      y = refYear;
      const candidate = new Date(y, parsed.getMonth(), parsed.getDate());
      if (candidate < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())) {
        y += 1;
      }
    }
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * 5. Collect & Validate Input Executor (COLLECT_INPUT, INPUT_COLLECTION, QUESTION)
 */
async function execute(node, context) {
  const { session = {}, userInput = '', isWaitingForThisNode = false } = context;
  const config = { ...(node.data || {}), ...(node.config || {}) };
  const varName = config.saveAs || config.variable || config.variableName || 'user_input';
  const inputType = String(config.inputType || config.validationType || config.validation?.type || 'TEXT').toUpperCase();
  const maxRetries = Number(config.maxRetries || 3);
  const retryKey = `_retries_${node.id}`;

  // If node was awaiting input from the user:
  if (isWaitingForThisNode) {
    const raw = String(userInput || '').trim();
    let isValid = false;
    let parsedValue = raw;

    switch (inputType) {
      case 'EMAIL':
        isValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw);
        parsedValue = raw.toLowerCase();
        break;

      case 'PHONE': {
        const cleanDigits = raw.replace(/\D/g, '');
        isValid = cleanDigits.length >= 10 && cleanDigits.length <= 15;
        parsedValue = cleanDigits;
        break;
      }

      case 'NUMBER': {
        const num = Number(raw.replace(/,/g, ''));
        isValid = !isNaN(num) && raw.length > 0;
        parsedValue = num;
        break;
      }

      case 'DATE': {
        const parsedDate = parseDateInput(raw);
        isValid = parsedDate !== null;
        parsedValue = parsedDate;
        break;
      }

      case 'DATE_RANGE': {
        const parts = raw.split(/to|-|\/|and/).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const d1 = parseDateInput(parts[0]);
          const d2 = parseDateInput(parts[1]);
          isValid = d1 !== null && d2 !== null;
          parsedValue = { check_in: d1, check_out: d2 };
        } else {
          isValid = false;
        }
        break;
      }

      case 'REGEX': {
        try {
          const pattern = new RegExp(config.regexPattern || '.*');
          isValid = pattern.test(raw);
        } catch (e) {
          isValid = false;
        }
        break;
      }

      case 'TEXT':
      default:
        isValid = raw.length > 0;
        parsedValue = raw;
        break;
    }

    if (isValid) {
      return {
        action: 'CONTINUE',
        nextHandle: 'valid',
        updatedData: {
          [varName]: parsedValue,
          [retryKey]: 0
        },
        traceNote: `Validated input for "${varName}": ${JSON.stringify(parsedValue)} [Handle: valid]`
      };
    }

    // Invalid input: check retry counter
    const currentRetries = Number(session[retryKey] || 0) + 1;
    if (currentRetries > maxRetries) {
      return {
        action: 'CONTINUE',
        nextHandle: 'max_retries',
        updatedData: {
          [retryKey]: 0
        },
        traceNote: `Max retries (${maxRetries}) exceeded for step "${node.title || node.id}". Proceeding via fallback handle [max_retries].`
      };
    }

    // Still has retries left: prompt user to retry
    let defaultRetryMsg = `⚠️ We couldn't validate your input for ${varName}. Please enter a valid value.\n\n💡 _Tip: Reply *menu* at any time to return to the main menu._`;
    if (inputType === 'DATE' || inputType === 'DATE_RANGE') {
      defaultRetryMsg = `📅 Please enter a valid date (e.g. *tomorrow*, *20 Nov*, or *YYYY-MM-DD*).\n\n💡 _Tip: Reply *menu* at any time to return to the main menu._`;
    }

    const rawRetry = config.retryMessage || config.errorMessage || config.validation?.errorMessage || defaultRetryMsg;
    let retryMsg = interpolateTemplate(rawRetry, context.variableContext || session);
    if (!retryMsg.toLowerCase().includes('menu')) {
      retryMsg += `\n\n💡 _Tip: Reply *menu* at any time to return to the main menu._`;
    }

    return {
      action: 'WAIT_FOR_INPUT',
      replyMessages: [retryMsg],
      updatedData: {
        [retryKey]: currentRetries
      },
      traceNote: `Invalid input received (Attempt ${currentRetries}/${maxRetries}). Sent retry prompt.`
    };
  }

  // First time entering node: send question prompt and wait for user's input
  const promptRaw = config.prompt || config.questionText || config.text || config.message || `Please provide ${varName}:`;
  const renderedPrompt = interpolateTemplate(promptRaw, context.variableContext || session);

  return {
    action: 'WAIT_FOR_INPUT',
    replyMessages: [renderedPrompt],
    updatedData: {
      [retryKey]: 0
    },
    traceNote: `Intake step prompt sent for "${varName}". Pausing for user input.`
  };
}

module.exports = { execute, parseDateInput };
