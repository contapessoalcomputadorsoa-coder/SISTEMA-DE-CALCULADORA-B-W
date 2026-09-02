// CALCULADORA P&B - LOGICA PRINCIPAL

(function () {
  'use strict';

  // FUNCAO AUXILIAR PARA SELECIONAR ELEMENTOS DO DOM
  const $ = (sel) => document.querySelector(sel);

  // REFERENCIAS DOS ELEMENTOS DA INTERFACE
  const expressionEl = $('#expression');
  const resultEl = $('#result');
  const btnToggleScience = $('#btnToggleScience');
  const scientificPanel = $('#scientificPanel');
  const btnHistoryToggle = $('#btnHistoryToggle');
  const historyPanel = $('#historyPanel');
  const historyOverlay = $('#historyOverlay');
  const historyList = $('#historyList');
  const btnClearHistory = $('#btnClearHistory');
  const keyboardGrid = $('.keyboard-grid');

  // ESTADO GLOBAL DA CALCULADORA
  let state = {
    current: '0', // VALOR ATUAL EXIBIDO NO DISPLAY
    expression: '', // PARTE ESQUERDA DA EXPRESSAO (ANTES DO OPERADOR)
    fullExpression: // EXPRESSAO COMPLETA EXIBIDA ACIMA DO RESULTADO
      '',
    operator: null, // OPERADOR MATEMATICO SELECIONADO
    waitingForOperand: false, // INDICA SE AGUARDA UM NOVO NUMERO
    lastResult: null, // ULTIMO RESULTADO CALCULADO
    history: [], // LISTA DE HISTORICO DE CALCULOS
    openParens: 0, // QUANTIDADE DE PARENTESIS ABERTOS
  };

  // ESCAPA CARACTERES HTML PARA EVITAR INJECAO
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // FORMATA O RESULTADO NUMERICO PARA EXIBICAO
  function formatResult(num) {
    if (!isFinite(num)) return 'Erro';
    if (Number.isInteger(num) && Math.abs(num) < 1e15) {
      return num.toLocaleString('pt-BR');
    }
    const rounded = parseFloat(num.toPrecision(12));
    return rounded.toLocaleString('pt-BR');
  }

  // CONVERTE STRING NO FORMATO BRASILEIRO PARA FLOAT
  function parseBrazilianNumber(str) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
  }

  // CARREGA O HISTORICO SALVO NO LOCALSTORAGE
  function loadHistory() {
    try {
      const stored = localStorage.getItem('calc_history');
      if (stored) state.history = JSON.parse(stored);
    } catch (_) {
      state.history = [];
    }
  }

  // SALVA O HISTORICO NO LOCALSTORAGE
  function saveHistory() {
    try {
      localStorage.setItem('calc_history', JSON.stringify(state.history));
    } catch (_) {
      // SILENCIO
    }
  }

  // ADICIONA UM ITEM AO HISTORICO DE CALCULOS
  function addHistoryItem(expression, result) {
    state.history.push({ expression, result, timestamp: Date.now() });
    if (state.history.length > 100) state.history.shift();
    saveHistory();
    renderHistory();
  }

  // RENDERIZA A LISTA DE HISTORICO NA TELA
  function renderHistory() {
    if (state.history.length === 0) {
      historyList.innerHTML = '<div class="history-empty">Nenhum cálculo ainda</div>';
      return;
    }

    historyList.innerHTML = state.history
      .slice()
      .reverse()
      .map(
        (item, i) => `
        <div class="history-item" data-index="${state.history.length - 1 - i}">
          <div class="history-expression">${escapeHtml(item.expression)}</div>
          <div class="history-result">${escapeHtml(item.result)}</div>
        </div>`
      )
      .join('');
  }

  // LIMPA TODO O HISTORICO DE CALCULOS
  function clearHistory() {
    state.history = [];
    saveHistory();
    renderHistory();
  }

  // ATUALIZA O DISPLAY COM OS VALORES ATUAIS DO ESTADO
  function updateDisplay() {
    resultEl.textContent = state.current;
    expressionEl.textContent = state.fullExpression;
    resultEl.classList.remove('animating');
    void resultEl.offsetWidth;
    resultEl.classList.add('animating');
  }

  // MONTA A EXPRESSAO COMPLETA PARA EXIBICAO
  function buildFullExpression() {
    let expr = state.expression;
    if (state.operator) {
      const symbols = { '/': '÷', '*': '×', '-': '−', '+': '+', '^': '^' };
      expr += ' ' + (symbols[state.operator] || state.operator) + ' ';
    }
    state.fullExpression = expr;
  }

  // REALIZA A OPERACAO MATEMATICA ENTRE DOIS NUMEROS
  function calculate(left, right, op) {
    const a = parseBrazilianNumber(left);
    const b = parseBrazilianNumber(right);
    if (isNaN(a) || isNaN(b)) return null;

    switch (op) {
      case '+': return formatResult(a + b);
      case '-': return formatResult(a - b);
      case '*': return formatResult(a * b);
      case '/': return b === 0 ? null : formatResult(a / b);
      case '^': return formatResult(Math.pow(a, b));
      default: return null;
    }
  }

  // DIVIDE A EXPRESSAO EM TOKENS PARA ANALISE
  function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
      if (expr[i] === ' ') { i++; continue; }

      if ('+-×÷*/^'.includes(expr[i])) {
        tokens.push({ type: 'operator', value: expr[i] });
        i++;
      } else if (expr[i] === '(' || expr[i] === ')') {
        tokens.push({ type: 'paren', value: expr[i] });
        i++;
      } else if (/[0-9.,]/.test(expr[i])) {
        let num = '';
        while (i < expr.length && /[0-9.,]/.test(expr[i])) {
          num += expr[i];
          i++;
        }
        tokens.push({ type: 'number', value: parseBrazilianNumber(num) || 0 });
      } else {
        i++;
      }
    }
    return tokens;
  }

  // ANALISA EXPRESSOES COM SOMA E SUBTRACAO
  function parseExpression(tokens, pos) {
    let left = parseTerm(tokens, pos);
    while (left.pos < tokens.length && tokens[left.pos] &&
      tokens[left.pos].type === 'operator' && (tokens[left.pos].value === '+' || tokens[left.pos].value === '-')) {
      const op = tokens[left.pos].value;
      const right = parseTerm(tokens, left.pos + 1);
      left = {
        value: op === '+' ? left.value + right.value : left.value - right.value,
        pos: right.pos,
      };
    }
    return left;
  }

  // ANALISA EXPRESSOES COM MULTIPLICACAO, DIVISAO E POTENCIA
  function parseTerm(tokens, pos) {
    let left = parseFactor(tokens, pos);
    while (left.pos < tokens.length && tokens[left.pos] &&
      tokens[left.pos].type === 'operator' && ('×÷*/^'.includes(tokens[left.pos].value))) {
      const op = tokens[left.pos].value;
      const right = parseFactor(tokens, left.pos + 1);
      if ((op === '÷' || op === '/') && right.value === 0) {
        return { value: Infinity, pos: right.pos };
      }
      let value;
      switch (op) {
        case '×': case '*': value = left.value * right.value; break;
        case '÷': case '/': value = left.value / right.value; break;
        case '^': value = Math.pow(left.value, right.value); break;
        default: value = right.value;
      }
      left = { value, pos: right.pos };
    }
    return left;
  }

  // ANALISA FATORES ISOLADOS (NUMEROS E PARENTESIS)
  function parseFactor(tokens, pos) {
    if (pos >= tokens.length) return { value: 0, pos };
    const token = tokens[pos];

    if (token.type === 'number') {
      return { value: token.value, pos: pos + 1 };
    }

    if (token.type === 'paren' && token.value === '(') {
      const result = parseExpression(tokens, pos + 1);
      if (result.pos < tokens.length && tokens[result.pos] &&
        tokens[result.pos].type === 'paren' && tokens[result.pos].value === ')') {
        result.pos++;
      }
      return result;
    }

    return { value: 0, pos: pos + 1 };
  }

  // AVALIA UMA EXPRESSAO COMPLETA USANDO O PARSER SEGURO
  function evaluateExpression(expr) {
    try {
      const normalized = expr.replace(/\s+/g, ' ').trim();
      const tokens = tokenize(normalized);
      if (tokens.length === 0) return null;
      const result = parseExpression(tokens, 0);
      return formatResult(result.value);
    } catch (_) {
      return null;
    }
  }

  // ADICIONA UM NUMERO AO DISPLAY
  function inputNumber(num) {
    if (state.waitingForOperand) {
      state.current = num;
      state.waitingForOperand = false;
    } else {
      state.current = state.current === '0' ? num : state.current + num;
    }
    buildFullExpression();
    updateDisplay();
  }

  // ADICIONA UM PONTO DECIMAL AO NUMERO ATUAL
  function inputDecimal() {
    if (state.waitingForOperand) {
      state.current = '0.';
      state.waitingForOperand = false;
      buildFullExpression();
      updateDisplay();
      return;
    }
    if (!state.current.includes('.')) {
      state.current += '.';
    }
    buildFullExpression();
    updateDisplay();
  }

  // SELECIONA UM OPERADOR MATEMATICO
  function inputOperator(op) {
    const currentNum = state.current;

    if (state.operator && !state.waitingForOperand) {
      const result = calculate(state.expression, currentNum, state.operator);
      if (result === null) {
        state.current = 'Erro';
        state.expression = '';
        state.fullExpression = '';
        state.operator = null;
        state.waitingForOperand = true;
        updateDisplay();
        return;
      }
      state.current = result;
      state.expression = result;
    } else {
      state.expression = currentNum;
    }

    state.operator = op;
    state.waitingForOperand = true;
    state.lastResult = currentNum;
    buildFullExpression();
    updateDisplay();
  }

  // APLICA A OPERACAO DE PORCENTAGEM
  function inputPercent() {
    const num = parseBrazilianNumber(state.current);
    if (isNaN(num)) return;
    if (state.operator && state.expression) {
      const base = parseBrazilianNumber(state.expression);
      state.current = formatResult((base * num) / 100);
    } else {
      state.current = formatResult(num / 100);
    }
    buildFullExpression();
    updateDisplay();
  }

  // ABRE OU FECHA UM PARENTESE NA EXPRESSAO
  function inputParenthesis() {
    if (state.waitingForOperand || state.current === '0' || state.current === 'Erro') {
      state.current = '(';
      state.waitingForOperand = false;
      state.openParens++;
    } else if (state.openParens > 0) {
      state.current += ')';
      state.openParens--;
      if (state.openParens === 0 && state.operator) {
        const result = evaluateExpression(state.current);
        if (result !== null) {
          state.expression = state.current;
          state.current = result;
          state.waitingForOperand = true;
        }
      }
    }
    buildFullExpression();
    updateDisplay();
  }

  // EXECUTA O CALCULO DA EXPRESSAO ATUAL
  function performEquals() {
    let expr = state.expression;
    if (state.operator) {
      const symbols = { '/': '÷', '*': '×', '-': '−', '+': '+', '^': '^' };
      expr += ' ' + (symbols[state.operator] || state.operator) + ' ' + state.current;
    } else {
      expr = state.current;
    }

    let result;
    if (state.operator) {
      result = calculate(state.expression, state.current, state.operator);
    } else {
      result = evaluateExpression(state.current);
    }

    if (result === null || result === undefined) {
      state.current = 'Erro';
      state.expression = '';
      state.fullExpression = '';
      state.operator = null;
      state.waitingForOperand = true;
      updateDisplay();
      return;
    }

    const displayExpr = state.fullExpression || expr;
    addHistoryItem(displayExpr, result);

    state.current = result;
    state.expression = '';
    state.fullExpression = '';
    state.operator = null;
    state.waitingForOperand = true;
    updateDisplay();
  }

  // LIMPA TODOS OS CAMPOS E REINICIA A CALCULADORA
  function clearAll() {
    state.current = '0';
    state.expression = '';
    state.fullExpression = '';
    state.operator = null;
    state.waitingForOperand = false;
    state.lastResult = null;
    state.openParens = 0;
    updateDisplay();
  }

  // APAGA O ULTIMO CARACTERE DO DISPLAY
  function backspace() {
    if (state.waitingForOperand || state.current === 'Erro') {
      clearAll();
      return;
    }
    if (state.current.length <= 1 || (state.current.length === 2 && state.current[0] === '-')) {
      state.current = '0';
    } else {
      state.current = state.current.slice(0, -1);
    }
    buildFullExpression();
    updateDisplay();
  }

  // CALCULA O FATORIAL DE UM NUMERO
  function factorial(n) {
    if (n < 0) return NaN;
    if (n === 0 || n === 1) return 1;
    if (n > 170) return Infinity;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }

  // CONVERTE GRAUS PARA RADIANOS
  function toRadians(deg) {
    return deg * (Math.PI / 180);
  }

  // APLICA UMA FUNCAO CIENTIFICA SOBRE O NUMERO ATUAL
  function applyScientific(action) {
    const num = parseBrazilianNumber(state.current);
    if (isNaN(num) && action !== 'pi' && action !== 'e') return;

    let result;
    let exprLabel = '';

    switch (action) {
      case 'sqrt':
        if (num < 0) { result = 'Erro'; }
        else { result = formatResult(Math.sqrt(num)); exprLabel = `√(${state.current})`; }
        break;
      case 'square':
        result = formatResult(num * num);
        exprLabel = `(${state.current})²`;
        break;
      case 'pi':
        result = formatResult(Math.PI);
        exprLabel = 'π';
        break;
      case 'e':
        result = formatResult(Math.E);
        exprLabel = 'e';
        break;
      case 'sin':
        result = formatResult(Math.sin(toRadians(num)));
        exprLabel = `sin(${state.current})`;
        break;
      case 'cos':
        result = formatResult(Math.cos(toRadians(num)));
        exprLabel = `cos(${state.current})`;
        break;
      case 'tan':
        result = formatResult(Math.tan(toRadians(num)));
        exprLabel = `tan(${state.current})`;
        break;
      case 'log':
        if (num <= 0) { result = 'Erro'; }
        else { result = formatResult(Math.log10(num)); exprLabel = `log(${state.current})`; }
        break;
      case 'ln':
        if (num <= 0) { result = 'Erro'; }
        else { result = formatResult(Math.log(num)); exprLabel = `ln(${state.current})`; }
        break;
      case 'factorial':
        result = formatResult(factorial(Math.floor(num)));
        exprLabel = `${state.current}!`;
        break;
      case 'inverse':
        if (num === 0) { result = 'Erro'; }
        else { result = formatResult(1 / num); exprLabel = `1/(${state.current})`; }
        break;
      default:
        return;
    }

    if (exprLabel && result !== 'Erro') {
      addHistoryItem(exprLabel, result);
    }

    state.current = result;
    state.waitingForOperand = true;
    buildFullExpression();
    updateDisplay();
  }

  // REDIRECIONA A ACAO DO BOTAO CLICADO
  function handleButtonAction(action, value) {
    if (state.current === 'Erro' && action !== 'clear') {
      clearAll();
    }

    switch (action) {
      case 'number':     inputNumber(value); break;
      case 'decimal':    inputDecimal(); break;
      case 'operator':   inputOperator(value); break;
      case 'equals':     performEquals(); break;
      case 'clear':      clearAll(); break;
      case 'backspace':  backspace(); break;
      case 'percent':    inputPercent(); break;
      case 'parenthesis': inputParenthesis(); break;
    }
  }

  // CAPTA CLIQUES NOS BOTOES DO TECLADO VIRTUAL
  keyboardGrid.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleButtonAction(btn.dataset.action, btn.dataset.value || '');
  });

  // CAPTA CLIQUES NOS BOTOES CIENTIFICOS
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.btn-sci[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (state.current === 'Erro') clearAll();
    if (action === 'power') {
      inputOperator('^');
    } else {
      applyScientific(action);
    }
  });

  // ABRE E FECHA O PAINEL CIENTIFICO
  btnToggleScience.addEventListener('click', function () {
    const isOpen = scientificPanel.classList.toggle('open');
    btnToggleScience.classList.toggle('active', isOpen);
  });

  // ABRE E FECHA O PAINEL DE HISTORICO
  function toggleHistory() {
    const isOpen = historyPanel.classList.toggle('open');
    historyOverlay.classList.toggle('open', isOpen);
  }

  // EVENTOS DO PAINEL DE HISTORICO
  btnHistoryToggle.addEventListener('click', toggleHistory);
  historyOverlay.addEventListener('click', toggleHistory);
  btnClearHistory.addEventListener('click', clearHistory);

  // PERMITE CLICAR EM UM ITEM DO HISTORICO PARA REUTILIZAR
  historyList.addEventListener('click', function (e) {
    const item = e.target.closest('.history-item');
    if (!item) return;
    const index = parseInt(item.dataset.index, 10);
    if (isNaN(index) || !state.history[index]) return;
    state.current = state.history[index].result;
    state.waitingForOperand = true;
    buildFullExpression();
    updateDisplay();
    toggleHistory();
  });

  // CAPTA ATALHOS DO TECLADO FISICO
  document.addEventListener('keydown', function (e) {
    const key = e.key;

    if (key >= '0' && key <= '9') {
      e.preventDefault();
      inputNumber(key);
    } else if (key === '.' || key === ',') {
      e.preventDefault();
      inputDecimal();
    } else if (key === '+') {
      e.preventDefault();
      inputOperator('+');
    } else if (key === '-') {
      e.preventDefault();
      inputOperator('-');
    } else if (key === '*') {
      e.preventDefault();
      inputOperator('*');
    } else if (key === '/') {
      e.preventDefault();
      inputOperator('/');
    } else if (key === 'Enter' || key === '=') {
      e.preventDefault();
      performEquals();
    } else if (key === 'Escape') {
      e.preventDefault();
      clearAll();
    } else if (key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (key === '(' || key === ')') {
      e.preventDefault();
      inputParenthesis();
    } else if (key === '%') {
      e.preventDefault();
      inputPercent();
    }
  });

  // INICIALIZA A CALCULADORA AO CARREGAR
  loadHistory();
  renderHistory();
  updateDisplay();

})();
