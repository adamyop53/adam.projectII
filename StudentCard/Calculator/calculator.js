/* =========================================================================
   calculator.js - the JavaScript "brain" of the React calculator.

   This file contains only plain JavaScript (no React, no JSX) so that it can
   be used by the React components in calculator.html AND tested on its own:

       node -e "console.log(require('./calculator.js'))"

   The important idea is very React friendly: reduce(state, key) is a PURE
   function. It receives the current state plus the key that was pressed and
   returns a brand new state. React's useReducer() in calculator.html uses it.
   ========================================================================= */
(function (global, factory) {
    var engine = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = engine;            // Node (used by the tests)
    } else {
        global.CalculatorEngine = engine;   // Browser: window.CalculatorEngine
    }
})(typeof globalThis === 'object' ? globalThis : this, function () {
    'use strict';

    var MAX_DIGITS = 15;      // how many digits one number may have
    var HISTORY_LIMIT = 8;    // how many finished calculations we remember

    /* The state the calculator starts in (and returns to after "AC"). */
    var INITIAL_STATE = {
        current: '0',     // the number being typed / shown on the display
        previous: null,   // the stored left hand operand
        operator: null,   // the pending operator: + - x /
        overwrite: true,  // true = the next digit replaces the display
        error: false,     // true = the display shows "Error"
        history: []       // the list of finished calculations
    };

    /* ---------------------------------------------------------------------
       Numbers
       --------------------------------------------------------------------- */

    /* 0.1 + 0.2 === 0.30000000000000004 in JavaScript, so every result is
       rounded to 12 significant digits to keep the display tidy.            */
    function round(value) {
        if (!Number.isFinite(value)) {
            return value;
        }
        return Number.parseFloat(value.toPrecision(12));
    }

    /* The four operations. NaN means "cannot calculate" and shows as Error.  */
    function calculate(a, b, operator) {
        switch (operator) {
            case '+': return round(a + b);
            case '−': return round(a - b);
            case '×': return round(a * b);
            case '÷': return b === 0 ? NaN : round(a / b);
            default: return round(b);
        }
    }

    /* "1234567" -> "1,234,567" (also keeps "12." and "-1234.5" intact).      */
    function withThousands(text) {
        var match = /^(-?)(\d+)(\.\d*)?$/.exec(text);
        if (!match) {
            return text;                       // "Error", "1e-7", "0." ...
        }
        var sign = match[1];
        var digits = match[2];
        var decimals = match[3] || '';
        return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decimals;
    }

    /* Turns a number into the text we show to the user.                     */
    function formatNumber(value) {
        var number = typeof value === 'number' ? value : Number.parseFloat(value);

        if (!Number.isFinite(number)) {
            return 'Error';
        }
        /* Very big or small numbers are easier to read in exponent form.     */
        if (Math.abs(number) >= 1e15 || (number !== 0 && Math.abs(number) < 1e-9)) {
            return number.toExponential(6).replace(/\.?0+e/, 'e');
        }
        return withThousands(String(round(number)));
    }

    /* The big number on the display ("current" is raw text being typed).    */
    function displayValue(state) {
        if (state.error) {
            return 'Error';
        }
        return withThousands(state.current);
    }

    /* The small line above it, e.g. "12 ×" or a friendly hint.              */
    function displayExpression(state) {
        if (state.error) {
            return 'Press AC to start again';
        }
        if (state.previous === null || state.operator === null) {
            return 'Ready';
        }
        return formatNumber(state.previous) + ' ' + state.operator;
    }

    /* ---------------------------------------------------------------------
       State changes - one small function per key
       --------------------------------------------------------------------- */

    /* If the last action ended in an error, the next key press (other than
       AC) starts from a clean slate but keeps the history.                  */
    function revive(state) {
        if (state.error) {
            return { ...INITIAL_STATE, history: state.history };
        }
        return state;
    }

    /* This state means "we cannot calculate that".                          */
    function errorState(state) {
        return { ...INITIAL_STATE, history: state.history, error: true };
    }

    /* 0 - 9                                                                 */
    function digit(state, key) {
        var s = revive(state);

        if (s.overwrite) {                       // start a brand new number
            return { ...s, current: key, overwrite: false };
        }
        var length = s.current.replace(/[-.]/g, '').length;
        if (length >= MAX_DIGITS) {
            return s;                            // ignore, number is full
        }
        return { ...s, current: s.current === '0' ? key : s.current + key };
    }

    /* .                                                                     */
    function dot(state) {
        var s = revive(state);

        if (s.overwrite) {
            return { ...s, current: '0.', overwrite: false };
        }
        if (s.current.indexOf('.') !== -1) {
            return s;                            // only one decimal point
        }
        return { ...s, current: s.current + '.' };
    }

    /* Backspace - delete the last character that was typed.                 */
    function backspace(state) {
        var s = revive(state);

        if (s.overwrite) {
            return { ...s, current: '0', overwrite: false };
        }
        var next = s.current.slice(0, -1);
        return { ...s, current: (next === '' || next === '-') ? '0' : next };
    }

    /* +/- - flip the sign of the number on the display.                     */
    function negate(state) {
        var s = revive(state);

        if (s.current === '0' || s.current === '0.') {
            return s;                            // zero has no sign
        }
        var flipped = s.current.charAt(0) === '-' ? s.current.slice(1) : '-' + s.current;
        return { ...s, current: flipped };
    }

    /* % - divide the number on the display by 100.                          */
    function percent(state) {
        var s = revive(state);
        return { ...s, current: String(round(Number.parseFloat(s.current) / 100)), overwrite: false };
    }

    /* + - x / - store the left operand, or do the waiting calculation
       first so that "2 + 3 +" already shows 5.                              */
    function chooseOperator(state, operator) {
        var s = revive(state);

        if (s.operator !== null && !s.overwrite) {
            var result = calculate(s.previous, Number.parseFloat(s.current), s.operator);
            if (!Number.isFinite(result)) {
                return errorState(s);
            }
            return { ...s, previous: result, current: String(result), operator: operator, overwrite: true };
        }
        return { ...s, previous: Number.parseFloat(s.current), operator: operator, overwrite: true };
    }

    /* = - finish the calculation and write it into the history.             */
    function equals(state) {
        var s = revive(state);

        if (s.operator === null || s.previous === null) {
            return s;                            // nothing is pending
        }
        var operand = Number.parseFloat(s.current);
        var result = calculate(s.previous, operand, s.operator);

        if (!Number.isFinite(result)) {
            return errorState(s);
        }
        var entry = formatNumber(s.previous) + ' ' + s.operator + ' ' +
                    formatNumber(operand) + ' = ' + formatNumber(result);

        return {
            current: String(result),
            previous: null,
            operator: null,
            overwrite: true,
            error: false,
            history: [entry].concat(s.history).slice(0, HISTORY_LIMIT)
        };
    }

    /* AC - everything back to the start, but keep the history.              */
    function clearAll(state) {
        return { ...INITIAL_STATE, history: state.history };
    }

    /* ---------------------------------------------------------------------
       The reducer - the single door every key press goes through
       --------------------------------------------------------------------- */

    /* Extra action that is not a key on the keypad.                         */
    var CLEAR_HISTORY = 'CLEAR-HISTORY';

    function reduce(state, key) {
        if (/^[0-9]$/.test(key)) {
            return digit(state, key);
        }
        switch (key) {
            case '.': return dot(state);
            case '+':
            case '−':
            case '×':
            case '÷': return chooseOperator(state, key);
            case '=': return equals(state);
            case 'AC': return clearAll(state);
            case '⌫': return backspace(state);
            case '±': return negate(state);
            case '%': return percent(state);
            case CLEAR_HISTORY: return { ...state, history: [] };
            default: return state;               // unknown key -> no change
        }
    }

    /* ---------------------------------------------------------------------
       The keypad
       --------------------------------------------------------------------- */

    /* 4 columns x 5 rows. "type" only decides which CSS class is used.     */
    var KEYPAD = [
        { label: 'AC', type: 'function', name: 'All clear' },
        { label: '⌫', type: 'function', name: 'Backspace' },
        { label: '%', type: 'function', name: 'Percent' },
        { label: '÷', type: 'operator', name: 'Divide' },
        { label: '7' }, { label: '8' }, { label: '9' },
        { label: '×', type: 'operator', name: 'Multiply' },
        { label: '4' }, { label: '5' }, { label: '6' },
        { label: '−', type: 'operator', name: 'Subtract' },
        { label: '1' }, { label: '2' }, { label: '3' },
        { label: '+', type: 'operator', name: 'Add' },
        { label: '±', type: 'function', name: 'Plus / minus' },
        { label: '0' },
        { label: '.' },
        { label: '=', type: 'equals', name: 'Equals' }
    ];

    /* Maps a key of a real keyboard (event.key) to a keypad label.         */
    function keyFromKeyboard(eventKey) {
        if (/^[0-9]$/.test(eventKey)) {
            return eventKey;
        }
        var map = {
            '.': '.', ',': '.',
            '+': '+', '-': '−', '*': '×', 'x': '×', 'X': '×', '/': '÷',
            '%': '%', '=': '=', 'Enter': '=',
            'Backspace': '⌫', 'Escape': 'AC', 'Delete': 'AC', 'c': 'AC', 'C': 'AC'
        };
        return map[eventKey] || null;
    }

    return {
        MAX_DIGITS: MAX_DIGITS,
        HISTORY_LIMIT: HISTORY_LIMIT,
        INITIAL_STATE: INITIAL_STATE,
        KEYPAD: KEYPAD,
        CLEAR_HISTORY: CLEAR_HISTORY,
        reduce: reduce,
        calculate: calculate,
        round: round,
        formatNumber: formatNumber,
        withThousands: withThousands,
        displayValue: displayValue,
        displayExpression: displayExpression,
        keyFromKeyboard: keyFromKeyboard
    };
});
