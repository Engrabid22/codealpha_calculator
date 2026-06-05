const expressionEl = document.getElementById('expression');
const valueEl = document.getElementById('value');
const previewEl = document.getElementById('preview');

const keysEl = document.querySelector('.keys');

const OPERATORS = new Set(['+', '-', '*', '/']);

let input = '';
let lastCommittedValue = '0';

function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function lastChar(str) {
  return str.length ? str[str.length - 1] : '';
}

function formatForDisplay(str) {
  // Replace ASCII operators with UI glyphs for the expression line.
  return str
    .replaceAll('*', '×')
    .replaceAll('/', '÷')
    .replaceAll('-', '−');
}

function clampInput(str) {
  // Keep it simple: no spaces.
  return str.replaceAll(' ', '');
}

function getCurrentEntry(expr) {
  if (!expr) return '0';

  // Return the last numeric segment (including a unary leading '-').
  let i = expr.length - 1;

  // If we end with an operator, there's no current number yet.
  if (OPERATORS.has(expr[i])) return '0';

  while (i >= 0 && !OPERATORS.has(expr[i])) i--;
  const segmentStart = i + 1;
  let segment = expr.slice(segmentStart);

  // Include unary minus if present right before the segment.
  const prev = i >= 0 ? expr[i] : '';
  const prevPrev = i - 1 >= 0 ? expr[i - 1] : '';
  const unaryMinus = prev === '-' && (i === 0 || OPERATORS.has(prevPrev));
  if (unaryMinus) segment = '-' + segment;

  if (segment === '' || segment === '-' || segment === '.') return '0';
  if (segment === '-.') return '-0.';
  if (segment.startsWith('.')) return `0${segment}`;
  if (segment.startsWith('-.')) return `-0${segment.slice(1)}`;

  return segment;
}

function canAppendDot(current) {
  // Allow one dot per number segment.
  for (let i = current.length - 1; i >= 0; i--) {
    const ch = current[i];
    if (ch === '.') return false;
    if (OPERATORS.has(ch)) return true;
  }
  return true;
}

function appendValue(val) {
  input = clampInput(input);

  if (val === '.') {
    if (!input || OPERATORS.has(lastChar(input))) {
      input += '0.';
    } else if (canAppendDot(input)) {
      input += '.';
    }
    render();
    return;
  }

  if (isDigit(val)) {
    if (input === '0') input = '';
    input += val;
    render();
    return;
  }

  if (OPERATORS.has(val)) {
    if (!input) {
      // Allow starting a negative number.
      if (val === '-') {
        input = '-';
      }
      render();
      return;
    }

    const last = lastChar(input);

    if (OPERATORS.has(last)) {
      // Replace the operator (e.g., 8+ -> 8-)
      input = input.slice(0, -1) + val;
      render();
      return;
    }

    if (last === '.') {
      // Avoid trailing dot before an operator: 8. + -> 8 +
      input = input.slice(0, -1);
    }

    input += val;
    render();
  }
}

function clearAll() {
  input = '';
  lastCommittedValue = '0';
  render();
}

function commitEquals() {
  const result = tryEvaluate(input);
  if (result == null) return;

  lastCommittedValue = result;
  input = result; // allow chaining operations
  render();
}

function render() {
  input = clampInput(input);

  const shownExpression = input;
  const shownEntry = input ? getCurrentEntry(input) : (lastCommittedValue || '0');

  expressionEl.textContent = shownExpression ? formatForDisplay(shownExpression) : '';
  valueEl.textContent = shownEntry;

  const preview = tryEvaluate(input);
  if (preview == null) {
    previewEl.textContent = '';
  } else if (preview === shownEntry && input === preview) {
    // When the input is already the result (after '='), hide preview.
    previewEl.textContent = '';
  } else {
    previewEl.textContent = `= ${preview}`;
  }
}

function tokenize(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === ' ') {
      i++;
      continue;
    }

    if (OPERATORS.has(ch)) {
      // Unary minus handling: treat '-' as part of a number if it starts expr or follows an operator.
      const prev = tokens.length ? tokens[tokens.length - 1] : null;
      const isUnaryMinus = ch === '-' && (prev == null || (prev.type === 'op' && prev.value !== 'u-'));

      if (isUnaryMinus) {
        // Convert unary minus to a special operator with higher precedence.
        tokens.push({ type: 'op', value: 'u-' });
      } else {
        tokens.push({ type: 'op', value: ch });
      }
      i++;
      continue;
    }

    if (isDigit(ch) || ch === '.') {
      let num = '';
      while (i < expr.length && (isDigit(expr[i]) || expr[i] === '.')) {
        num += expr[i];
        i++;
      }

      if (num === '.' || num === '') return null;
      const parsed = Number(num);
      if (!Number.isFinite(parsed)) return null;

      tokens.push({ type: 'num', value: parsed });
      continue;
    }

    // Unsupported character.
    return null;
  }

  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const ops = [];

  const precedence = (op) => {
    if (op === 'u-') return 3;
    if (op === '*' || op === '/') return 2;
    if (op === '+' || op === '-') return 1;
    return 0;
  };

  const isRightAssociative = (op) => op === 'u-';

  for (const token of tokens) {
    if (token.type === 'num') {
      output.push(token);
      continue;
    }

    if (token.type === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.type !== 'op') break;

        const p1 = precedence(token.value);
        const p2 = precedence(top.value);

        if ((isRightAssociative(token.value) && p1 < p2) || (!isRightAssociative(token.value) && p1 <= p2)) {
          output.push(ops.pop());
        } else {
          break;
        }
      }

      ops.push(token);
      continue;
    }

    return null;
  }

  while (ops.length) {
    const op = ops.pop();
    if (op.type !== 'op') return null;
    output.push(op);
  }

  return output;
}

function evalRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (token.type === 'num') {
      stack.push(token.value);
      continue;
    }

    if (token.type === 'op') {
      if (token.value === 'u-') {
        if (stack.length < 1) return null;
        stack.push(-stack.pop());
        continue;
      }

      if (stack.length < 2) return null;

      const b = stack.pop();
      const a = stack.pop();

      let result;
      switch (token.value) {
        case '+':
          result = a + b;
          break;
        case '-':
          result = a - b;
          break;
        case '*':
          result = a * b;
          break;
        case '/':
          if (b === 0) return null;
          result = a / b;
          break;
        default:
          return null;
      }

      if (!Number.isFinite(result)) return null;
      stack.push(result);
      continue;
    }

    return null;
  }

  if (stack.length !== 1) return null;
  return stack[0];
}

function normalizeNumber(n) {
  // Avoid ugly floating point artifacts for common cases.
  const rounded = Math.round((n + Number.EPSILON) * 1e12) / 1e12;
  return String(rounded);
}

function tryEvaluate(expr) {
  if (!expr) return null;

  const trimmed = expr.trim();
  const last = lastChar(trimmed);
  if (!trimmed || OPERATORS.has(last) || last === '.') return null;

  const tokens = tokenize(trimmed);
  if (!tokens || tokens.length === 0) return null;

  const rpn = toRpn(tokens);
  if (!rpn) return null;

  const result = evalRpn(rpn);
  if (result == null) return null;

  return normalizeNumber(result);
}

keysEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const action = btn.dataset.action;
  const val = btn.dataset.value;

  if (action === 'clear') {
    clearAll();
    return;
  }

  if (action === 'equals') {
    commitEquals();
    return;
  }

  if (val) appendValue(val);
});

window.addEventListener('keydown', (e) => {
  const key = e.key;

  if (key === 'Escape') {
    e.preventDefault();
    clearAll();
    return;
  }

  if (key === 'Enter' || key === '=') {
    e.preventDefault();
    commitEquals();
    return;
  }

  if (isDigit(key)) {
    e.preventDefault();
    appendValue(key);
    return;
  }

  if (key === '.') {
    e.preventDefault();
    appendValue('.');
    return;
  }

  if (key === '+' || key === '-' || key === '*' || key === '/') {
    e.preventDefault();
    appendValue(key);
  }
});

render();
