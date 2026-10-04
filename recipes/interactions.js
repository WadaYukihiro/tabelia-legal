(function(){
var modules={"./formatQty": function(module, exports, require) {
"use strict";
// Unit-aware quantity formatter.
//
// Rounding policy (also documented in CLAUDE.md):
//   Count units  (枝/個/枚/本/片 …)  → integer, min 1
//   Spoon units  (大さじ/小さじ)      → 0.5 step
//   Cup          (カップ)             → 0.25 step
//   g / ml       ≥100                 → 5 step
//   g / ml        10–99               → 1 step
//   g / ml        <10                 → 0.5 step
//   Everything else                   → 1 decimal
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNT_UNITS = void 0;
exports.fmtQty = fmtQty;
exports.fmtQtyWithUnit = fmtQtyWithUnit;
exports.COUNT_UNITS = [
    '枝', '個', '枚', '本', '片', '束', '株', '房', '粒',
    '缶', 'パック', '袋', 'セット', '尾', '切れ', '羽', '頭', '茎',
    'ひとつまみ', 'ひとにぎり', '適量',
];
const COUNT_UNIT_SET = new Set(exports.COUNT_UNITS);
function step(n, s) {
    return Math.round(n / s) * s;
}
function fmt(n) {
    if (Number.isInteger(n))
        return String(n);
    // Show at most 1 decimal; strip trailing zero
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : String(r);
}
function fmtQty(n, unit) {
    if (n <= 0)
        return '少量';
    if (COUNT_UNIT_SET.has(unit)) {
        return String(Math.max(1, Math.round(n)));
    }
    if (unit === '大さじ' || unit === '小さじ') {
        const r = step(n, 0.5);
        return r <= 0 ? '少量' : fmt(r);
    }
    if (unit === 'カップ') {
        const r = step(n, 0.25);
        return r <= 0 ? '少量' : fmt(r);
    }
    if (unit === 'g' || unit === 'ml') {
        if (n >= 100)
            return String(step(n, 5));
        if (n >= 10)
            return String(Math.round(n));
        const r = step(n, 0.5);
        return r <= 0 ? '少量' : fmt(r);
    }
    // Fallback: 1 decimal
    return fmt(n);
}
function fmtQtyWithUnit(n, unit) {
    if (unit === '適量')
        return '適量';
    const qty = fmtQty(n, unit);
    if (!unit)
        return qty;
    if (unit === '大さじ' || unit === '小さじ') {
        return `${unit}${qty}`;
    }
    return `${qty}${unit}`;
}

},
"./scaleRecipe": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingredientScaleFactor = ingredientScaleFactor;
exports.scaleQty = scaleQty;
exports.scaleInstructionText = scaleInstructionText;
exports.scaleIngredientNotes = scaleIngredientNotes;
const formatQty_1 = require("./formatQty");
const QUANTITY_PATTERN = String.raw `\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?`;
const COUNT_UNIT_PATTERN = formatQty_1.COUNT_UNITS
    .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|');
const QUANTITY_RE = new RegExp(`(大さじ|小さじ|カップ)(${QUANTITY_PATTERN})|(${QUANTITY_PATTERN})(kg|g|ml|mL|L|リットル|cc|${COUNT_UNIT_PATTERN})`, 'g');
function ingredientName(value) {
    return value.replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60)).trim();
}
// Match only a named ingredient immediately before the amount. Ambiguous names
// and unlabelled amounts retain the legacy proportional fallback.
function namedIngredient(prefix, ingredients) {
    var _a;
    const label = (_a = ingredientName(prefix).split(/[。\n、，,・]/).pop()) !== null && _a !== void 0 ? _a : '';
    const matches = ingredients.filter((item) => {
        const name = ingredientName(item.nameJa);
        return name && ['', 'を', 'の', 'は', '計', 'の残り'].some((particle) => label.endsWith(name + particle));
    });
    return matches.length === 1 ? matches[0] : undefined;
}
function comparableUnit(unit) {
    if (['ml', 'mL', 'L', 'リットル', 'cc'].includes(unit))
        return 'volume';
    if (['g', 'kg'].includes(unit))
        return 'mass';
    return unit;
}
function ingredientScaleFactor(ingredient, baseServings, targetServings) {
    var _a, _b, _c;
    const base = (_a = ingredient.baseQuantity) !== null && _a !== void 0 ? _a : ingredient.quantity;
    return base > 0 ? scaleQty(base, baseServings, targetServings, (_b = ingredient.role) !== null && _b !== void 0 ? _b : 'essential', ingredient.unit, (_c = ingredient.scalingBehavior) !== null && _c !== void 0 ? _c : undefined) / base : targetServings / baseServings;
}
function parseQuantityToken(token) {
    if (!token.includes('/'))
        return parseFloat(token);
    const [numerator, denominator] = token.split('/').map(Number);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
        return parseFloat(token);
    }
    return numerator / denominator;
}
// Scale a single ingredient quantity.
//
// When scalingBehavior is set explicitly it takes full precedence:
//   fixed     → quantity never changes regardless of servings
//   sublinear → ×ratio^0.75 (same as the flavor heuristic)
//   linear    → proportional
//
// When scalingBehavior is omitted the legacy heuristic applies:
//   ml ≥ 40 (cooking liquid) → linear regardless of role
//   role 'flavor'            → sublinear (×ratio^0.75)
//   everything else          → linear
function scaleQty(base, baseServings, target, role, unit, scalingBehavior) {
    const ratio = target / baseServings;
    if (scalingBehavior === 'fixed')
        return base;
    if (scalingBehavior === 'sublinear')
        return base * Math.pow(ratio, 0.75);
    if (scalingBehavior === 'linear')
        return base * ratio;
    // Legacy heuristic fallback
    if (unit === 'ml' && base >= 40)
        return base * ratio;
    if (role === 'flavor')
        return base * Math.pow(ratio, 0.75);
    return base * ratio;
}
// Scale quantity values embedded in step instruction text.
// Scales: weight/volume (g, kg, ml, L, cc), Japanese spoon/cup (大さじ, 小さじ, カップ),
//         and count units (個, 枚, 本, 片, 束, 株, 房, 粒, 缶, パック, 袋, セット, 尾, 切れ, 羽, 頭, 枝, 茎).
// Does NOT scale: time (分/時間), temperature (度/℃), size (cm/mm).
function scaleInstructionText(instruction, baseServings, targetServings, ingredients = []) {
    if (baseServings === targetServings)
        return instruction;
    const ratio = targetServings / baseServings;
    return instruction.replace(QUANTITY_RE, (match, spoon, spoonNumber, number, suffix, offset) => {
        // Vessel capacity is a specification, including the upper bound of a range.
        if (/容量\s*(?:\d+(?:\.\d+)?\s*[〜～–-]\s*)?$/.test(instruction.slice(0, offset)))
            return match;
        const unit = spoon || suffix;
        const amount = parseQuantityToken(spoonNumber || number);
        const ingredient = namedIngredient(instruction.slice(0, offset), ingredients);
        const factor = ingredient ? ingredientScaleFactor(ingredient, baseServings, targetServings) : ratio;
        const normalizedUnit = unit === 'mL' ? 'ml' : unit;
        return spoon ? `${unit}${(0, formatQty_1.fmtQty)(amount * factor, unit)}` : `${(0, formatQty_1.fmtQty)(amount * factor, normalizedUnit)}${normalizedUnit}`;
    });
}
/** Only scale an explicit partition of the listed amount; preserve ratios and piece sizes. */
function scaleIngredientNotes(text, ingredient, baseServings, targetServings) {
    var _a;
    if (baseServings === targetServings)
        return text;
    const quantities = [...text.matchAll(QUANTITY_RE)];
    if (quantities.length < 2 || quantities.some((m) => comparableUnit(m[1] || m[4]) !== comparableUnit(ingredient.unit)))
        return text;
    const unitMultiplier = (unit) => ['kg', 'L', 'リットル'].includes(unit) ? 1000 : 1;
    const total = quantities.reduce((sum, m) => sum + parseQuantityToken(m[2] || m[3]) * unitMultiplier(m[1] || m[4]), 0);
    if (Math.abs(total - ((_a = ingredient.baseQuantity) !== null && _a !== void 0 ? _a : ingredient.quantity) * unitMultiplier(ingredient.unit)) > 0.001)
        return text;
    const factor = ingredientScaleFactor(ingredient, baseServings, targetServings);
    return text.replace(QUANTITY_RE, (match, spoon, spoonNumber, number, suffix) => {
        const unit = spoon || suffix;
        if (comparableUnit(unit) !== comparableUnit(ingredient.unit))
            return match;
        const value = (0, formatQty_1.fmtQty)(parseQuantityToken(spoonNumber || number) * factor, unit === 'mL' ? 'ml' : unit);
        return spoon ? `${unit}${value}` : `${value}${unit}`;
    });
}

}}, cache={};
function require(id){if(!cache[id]){var m=cache[id]={exports:{}};modules[id](m,m.exports,require);}return cache[id].exports;}
window.TabeliaRecipeScaling=Object.assign({},require('./formatQty'),require('./scaleRecipe'));
})();
(function () {
  'use strict';

  var dataNode = document.getElementById('recipe-interaction-data');
  if (!dataNode) return;

  var data;
  try { data = JSON.parse(dataNode.textContent || '{}'); } catch (_) { return; }
  if (!data.recipe || !Array.isArray(data.ingredients) || !Array.isArray(data.steps)) return;

  var state = { servings: data.recipe.baseServings, selections: {} };
  // GA4 への明示イベント（analytics.js の tabeliaTrack）。人数変更と代替確定は Tabelia 固有の
  // 価値体験なので、拡張計測の form_submit に頼らず名前付きで送る（docs/ANALYTICS.md「Web」）
  var pageInfo = window.TABELIA_PAGE || {};
  window.TABELIA_ENGAGED = { servings: false, substitution: false };
  function track(name, params) {
    if (typeof window.tabeliaTrack === 'function') window.tabeliaTrack(name, params);
  }
  function changeServings(next) {
    if (next === state.servings) return;
    var from = state.servings;
    state.servings = next;
    window.TABELIA_ENGAGED.servings = true;
    track('servings_changed', { recipe_slug: pageInfo.recipe_slug || '', from: from, to: next });
    render();
  }
  var dialog = document.getElementById('substitution-dialog');
  var activeIngredientId = null;
  var lockedScrollY = 0;
  var scaling = window.TabeliaRecipeScaling;
  var fmtQtyWithUnit = scaling.fmtQtyWithUnit;
  var currentIngredients = [];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtMinutes(minutes) {
    var hours = Math.floor(minutes / 60), rest = minutes % 60;
    if (hours && rest) return hours + '時間' + rest + '分';
    if (hours) return hours + '時間';
    return minutes + '分';
  }
  function scaleQty(base, role, unit, behavior) {
    return scaling.scaleQty(base, data.recipe.baseServings, state.servings, role, unit, behavior);
  }
  function scaleInstruction(text) {
    return scaling.scaleInstructionText(text || '', data.recipe.baseServings, state.servings, currentIngredients);
  }

  function selectedOptions() {
    var selected = [];
    data.ingredients.forEach(function (ingredient) {
      var selectedId = state.selections[ingredient.id];
      if (!selectedId) return;
      var option = ingredient.substitutionOptions.find(function (item) { return item.id === selectedId; });
      if (option) selected.push({ ingredientId: ingredient.id, option: option });
    });
    return selected;
  }

  // 取り寄せリンク。generate-web-recipes.ts の buyLinksHtml() と同じ markup（意図的な重複）。
  // URL は生成時に埋めたもの（item.buy）をそのまま使い、JS では組み立てない。
  function buyLinksHtml(nameJa, buy) {
    if (!buy) return '';
    var attrs = function (merchant) { return 'data-affiliate="' + merchant + '" data-ingredient="' + esc(nameJa) + '" rel="nofollow sponsored noopener" target="_blank"'; };
    return '<span class="ingredient-buy"><a href="' + esc(buy.amazon) + '" ' + attrs('amazon') + '>Amazonで探す</a><a href="' + esc(buy.rakuten) + '" ' + attrs('rakuten') + '>楽天市場で探す</a></span>';
  }

  function findIngredientIndex(items, patch) {
    if (patch.targetStandardIngredientId) {
      var byId = items.findIndex(function (item) { return item.standardIngredientId === patch.targetStandardIngredientId; });
      if (byId >= 0) return byId;
    }
    if (!patch.targetNameJa) return -1;
    return items.findIndex(function (item) { return item.standardNameJa === patch.targetNameJa || item.nameJa === patch.targetNameJa; });
  }

  function adaptedIngredients(options) {
    var items = data.ingredients.map(function (ingredient) {
      var selectedId = state.selections[ingredient.id] || null;
      var option = ingredient.substitutionOptions.find(function (candidate) { return candidate.id === selectedId; });
      return {
        standardIngredientId: ingredient.id, standardNameJa: ingredient.nameJa,
        nameJa: option ? option.nameJa : ingredient.nameJa, baseQuantity: ingredient.quantity,
        unit: ingredient.unit, role: ingredient.role, scalingBehavior: ingredient.scalingBehavior,
        notes: ingredient.notes, isSubstituted: Boolean(option), substitutionOptionId: selectedId,
        buy: option ? (option.buy || null) : (ingredient.buy || null)
      };
    });
    options.forEach(function (selected) {
      (selected.option.ingredientPatches || []).forEach(function (patch) {
        if (patch.action === 'add') {
          items.push({
            standardIngredientId: patch.targetStandardIngredientId || 'variant:' + selected.option.id + ':' + items.length,
            standardNameJa: patch.nameJa || '', nameJa: patch.nameJa || '', baseQuantity: patch.quantity || 0,
            unit: patch.unit || '', role: patch.role || 'essential', scalingBehavior: patch.scalingBehavior || null,
            notes: patch.notes || null, isSubstituted: true, substitutionOptionId: selected.option.id,
            buy: patch.buy || null
          });
          return;
        }
        var index = findIngredientIndex(items, patch);
        if (index < 0) return;
        if (patch.action === 'remove') { items.splice(index, 1); return; }
        var current = items[index];
        items[index] = Object.assign({}, current, {
          nameJa: patch.nameJa != null ? patch.nameJa : current.nameJa,
          buy: patch.nameJa != null ? (patch.buy || null) : current.buy,
          baseQuantity: patch.quantity != null ? patch.quantity : current.baseQuantity,
          unit: patch.unit != null ? patch.unit : current.unit,
          role: patch.role != null ? patch.role : current.role,
          scalingBehavior: patch.scalingBehavior === null ? null : (patch.scalingBehavior || current.scalingBehavior),
          notes: patch.notes !== undefined ? patch.notes : current.notes,
          isSubstituted: true, substitutionOptionId: selected.option.id
        });
      });
    });
    return items.map(function (item) {
      item.quantity = scaleQty(item.baseQuantity, item.role, item.unit, item.scalingBehavior);
      return item;
    });
  }

  function cloneStep(step) {
    return Object.assign({}, step, {
      actionItems: (step.actionItems || []).slice(), parallelItems: (step.parallelItems || []).slice(),
      completionCriteria: (step.completionCriteria || []).slice(), cautionItems: (step.cautionItems || []).slice(),
      tipItems: (step.tipItems || []).slice()
    });
  }
  function stripParenthetical(value) { return String(value || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim(); }
  function stepText(step) {
    return [step.instruction, step.title, step.sectionTitle].concat(step.actionItems, step.parallelItems, step.completionCriteria, step.cautionItems, step.tipItems).filter(Boolean).join('\n');
  }
  function appendUnique(items, additions) {
    var next = items.slice(); (additions || []).forEach(function (item) { item = item.trim(); if (item && next.indexOf(item) < 0) next.push(item); }); return next;
  }
  function replaceNames(step, names, replacement) {
    function replace(value) { names.forEach(function (name) { value = String(value || '').split(name).join(replacement); }); return value; }
    var next = cloneStep(step); next.instruction = replace(next.instruction); next.title = next.title ? replace(next.title) : next.title;
    next.sectionTitle = next.sectionTitle ? replace(next.sectionTitle) : next.sectionTitle;
    ['actionItems','parallelItems','completionCriteria','cautionItems','tipItems'].forEach(function (key) { next[key] = next[key].map(replace); }); return next;
  }
  function adaptedSteps(options) {
    var steps = data.steps.map(cloneStep);
    options.forEach(function (selected) {
      (selected.option.stepPatches || []).forEach(function (patch) {
        var index = steps.findIndex(function (step) { return step.stepNumber === patch.stepNumber; });
        if (index < 0) return;
        if (patch.action === 'remove') { steps.splice(index, 1); return; }
        var current = steps[index];
        if (patch.action === 'append_note') {
          current.tipItems = current.tipItems.concat(patch.tipItems || []); current.changeReason = patch.changeReason || selected.option.nameJa; return;
        }
        var inferredWaiting = patch.instruction && /半解凍/.test(patch.instruction);
        steps[index] = Object.assign({}, current, {
          instruction: patch.instruction != null ? patch.instruction : current.instruction,
          title: patch.title !== undefined ? patch.title : current.title,
          actionItems: patch.actionItems || (patch.instruction != null ? [] : current.actionItems),
          parallelItems: patch.parallelItems || current.parallelItems,
          completionCriteria: patch.completionCriteria || current.completionCriteria,
          cautionItems: patch.cautionItems || current.cautionItems,
          tipItems: patch.tipItems || current.tipItems,
          durationMinutes: patch.durationMinutes != null ? patch.durationMinutes : (inferredWaiting ? 30 : current.durationMinutes),
          attentionLevel: patch.attentionLevel || (inferredWaiting ? 'waiting' : current.attentionLevel),
          sectionTitle: patch.sectionTitle !== undefined ? patch.sectionTitle : current.sectionTitle,
          changedFrom: current.instruction, changeReason: patch.changeReason || selected.option.nameJa
        });
      });
    });
    options.forEach(function (selected) {
      var option = selected.option;
      if ((option.procedureChanges || []).length && !(option.stepPatches || []).length) {
        var target = (option.affectedStepNumbers || []).find(function (number) { return steps.some(function (step) { return step.stepNumber === number; }); });
        var ingredient = data.ingredients.find(function (item) { return item.id === selected.ingredientId; });
        if (target == null) {
          var names = [ingredient && ingredient.nameJa, ingredient && stripParenthetical(ingredient.nameJa), option.nameJa, stripParenthetical(option.nameJa)].filter(Boolean);
          var matched = steps.find(function (step) { return names.some(function (name) { return stepText(step).indexOf(name) >= 0; }); });
          target = matched ? matched.stepNumber : (steps[0] && steps[0].stepNumber);
        }
        steps = steps.map(function (step) {
          if (step.stepNumber !== target) return step;
          var next = cloneStep(step); next.tipItems = appendUnique(next.tipItems, option.procedureChanges); next.changeReason = next.changeReason || option.nameJa + 'に合わせた手順補足'; return next;
        });
      }
      var original = data.ingredients.find(function (item) { return item.id === selected.ingredientId; });
      if (!original || /[＋+]|省略/.test(option.nameJa)) return;
      var removes = (option.ingredientPatches || []).some(function (p) { return p.action === 'remove' && (!p.targetNameJa || p.targetNameJa === original.nameJa); });
      if (removes) return;
      var hasAddRemove = (option.ingredientPatches || []).some(function (p) { return p.action === 'add' || p.action === 'remove'; });
      var update = (option.ingredientPatches || []).find(function (p) { return p.action === 'update' && p.nameJa && (!p.targetNameJa || p.targetNameJa === original.nameJa); });
      if (hasAddRemove && !update) return;
      var replacement = update ? update.nameJa : option.nameJa;
      var names = [original.nameJa, stripParenthetical(original.nameJa)].filter(function (name, index, array) { return name && name.length >= 2 && array.indexOf(name) === index; }).sort(function (a,b) { return b.length-a.length; });
      steps = steps.map(function (step) { return replaceNames(step, names, replacement); });
    });
    return steps.map(function (step, index) { step.stepNumber = index + 1; return step; });
  }

  function splitUnits(instruction) {
    return String(instruction || '').split('\n').flatMap(function (line) {
      var trimmed = line.trim().replace(/^・\s*/, ''); if (!trimmed) return [];
      return line.trim().startsWith('・') ? [trimmed] : trimmed.split(/(?<=。)/).map(function (s) { return s.trim(); }).filter(Boolean);
    });
  }
  function normalizeMatch(text) { return String(text || '').replace(/^（[^）]*(?:間に|あいだに)[^）]*）/, '').replace(/^・\s*/, '').replace(/\s+/g, '').replace(/[。.,，、]+$/g, '').trim(); }
  function orderedItems(step) {
    var actions = (step.actionItems || []).filter(Boolean), parallels = (step.parallelItems || []).filter(Boolean);
    if (!parallels.length || !step.instruction) return actions.map(function (text) { return {kind:'action',text:text}; }).concat(parallels.map(function (text) { return {kind:'parallel',text:text}; }));
    var usedA = new Set(), usedP = new Set(), ordered = [];
    function match(unit, items, used) { var n=normalizeMatch(unit), partial=-1; for(var i=0;i<items.length;i++){if(used.has(i))continue;var m=normalizeMatch(items[i]);if(m===n)return i;if(partial<0&&(n.indexOf(m)>=0||m.indexOf(n)>=0))partial=i;}return partial; }
    splitUnits(step.instruction).forEach(function (unit) { var p=match(unit,parallels,usedP), a=match(unit,actions,usedA); if(p>=0&&(/間に|あいだに/.test(unit)||a<0)){usedP.add(p);ordered.push({kind:'parallel',text:parallels[p]});}else if(a>=0){usedA.add(a);ordered.push({kind:'action',text:actions[a]});}else if(p>=0){usedP.add(p);ordered.push({kind:'parallel',text:parallels[p]});} });
    actions.forEach(function(text,i){if(!usedA.has(i))ordered.push({kind:'action',text:text});}); parallels.forEach(function(text,i){if(!usedP.has(i))ordered.push({kind:'parallel',text:text});}); return ordered;
  }

  // 料理用語を説明ダイアログのボタンにする。生成器（generate-web-recipes.ts の glossHtml）と同じ規則:
  // この料理に現れる用語の表記だけを data.glossary で受け取り、長い表記から順に、カタカナ語は語境界を見て照合する。
  // context のある語（「休ませる」）は、ステップ全体（renderStepBody の stepContext）に対象（生地・肉）が出ているときだけ照合する。
  var KATAKANA = /[ァ-ヶー]/;
  var glossaryMatchers = (data.glossary || []).flatMap(function (term) {
    var context = term.context ? new RegExp(term.context) : null;
    var fixed = term.surfaces.map(function (surface) { return { id: term.id, surface: surface, length: surface.length, context: context }; });
    if (!term.match) return fixed;
    var regex = new RegExp(term.match, 'y');
    return [{ id: term.id, regex: regex, length: term.surfaces[0].length + 1, context: context }].concat(fixed.slice(1));
  }).sort(function (a, b) { return b.length - a.length; });
  function glossaryMatchAt(text, index, matcher) {
    if (matcher.regex) { matcher.regex.lastIndex = index; var m = matcher.regex.exec(text); return m && m.index === index ? m[0].length : 0; }
    if (text.substr(index, matcher.surface.length) !== matcher.surface) return 0;
    if (/^[ァ-ヶー・]+$/.test(matcher.surface)) {
      var before = text[index - 1], after = text[index + matcher.surface.length];
      if ((before && KATAKANA.test(before)) || (after && KATAKANA.test(after))) return 0;
    }
    return matcher.surface.length;
  }
  function glossHtml(text, context) {
    text = String(text || '');
    if (context == null) context = text;
    if (!glossaryMatchers.length) return esc(text);
    var matchers = glossaryMatchers.filter(function (m) { return !m.context || m.context.test(context); });
    var html = '', plainStart = 0, i = 0;
    while (i < text.length) {
      var hit = null;
      for (var k = 0; k < matchers.length; k++) { var len = glossaryMatchAt(text, i, matchers[k]); if (len > 0) { hit = { id: matchers[k].id, length: len }; break; } }
      if (!hit) { i++; continue; }
      html += esc(text.slice(plainStart, i)) + '<button type="button" class="term" data-glossary-trigger="' + esc(hit.id) + '" aria-haspopup="dialog" aria-controls="glossary-dialog">' + esc(text.slice(i, i + hit.length)) + '</button>';
      i += hit.length; plainStart = i;
    }
    return html + esc(text.slice(plainStart));
  }

  function supportBlock(label, items, context) {
    if (!items || !items.length) return '';
    return '<div class="support-block"><p class="step-block-heading">' + esc(label) + '</p>' + items.map(function (item) { return '<p class="support-text">' + glossHtml(scaleInstruction(item), context) + '</p>'; }).join('') + '</div>';
  }
  // 用語の文脈条件はステップ全体で判定する（生成器の stepGlossaryContext と同じ構成）
  function stepContext(step) {
    return [step.title, step.instruction].concat(step.actionItems, step.parallelItems, step.completionCriteria, step.cautionItems, step.tipItems).filter(Boolean).join('\n');
  }
  function renderStepBody(step) {
    var context = stepContext(step);
    var structured = step.title || step.actionItems.length || step.parallelItems.length || step.completionCriteria.length || step.cautionItems.length || step.tipItems.length;
    if (!structured) return '<p>' + glossHtml(scaleInstruction(step.instruction), context) + '</p>';
    var html = step.title ? '<p class="step-title">' + esc(step.title) + '</p>' : '';
    var items = orderedItems(step);
    if (items.length) html += '<ul class="action-list">' + items.map(function (item, index) {
      var text = scaleInstruction(item.text);
      return '<li class="action-item"><span class="action-item-number">' + (index + 1) + '</span><span class="action-item-body">' + (item.kind === 'parallel' ? '<span class="parallel-label">並行</span>' : '') + '<span class="action-item-text">' + glossHtml(text, context) + '</span></span></li>';
    }).join('') + '</ul>'; else if (step.instruction) html += '<p>' + glossHtml(scaleInstruction(step.instruction), context) + '</p>';
    return html + supportBlock('完了の目安', step.completionCriteria, context) + supportBlock('注意点', step.cautionItems, context) + supportBlock('補足', step.tipItems, context);
  }

  function renderIngredients(items) {
    var list = document.querySelector('.ingredient-list'); if (!list) return;
    list.innerHTML = items.map(function (item) {
      var standard = data.ingredients.find(function (ingredient) { return ingredient.id === item.standardIngredientId; });
      var hasOptions = standard && standard.substitutionOptions.length;
      return '<li data-ingredient-row="' + esc(item.standardIngredientId) + '" class="' + (item.isSubstituted ? 'is-substituted' : '') + '">' +
        '<span class="ingredient-name" data-ingredient-name>' + esc(item.nameJa) + '</span><span class="ingredient-qty" data-ingredient-qty>' + esc(fmtQtyWithUnit(item.quantity, item.unit)) + '</span>' +
        (item.notes ? '<span class="ingredient-notes">' + esc(scaling.scaleIngredientNotes(item.notes, item, data.recipe.baseServings, state.servings)) + '</span>' : '') +
        buyLinksHtml(item.nameJa, item.buy) +
        (hasOptions ? '<button type="button" class="substitution-trigger" data-substitution-trigger="' + esc(item.standardIngredientId) + '"><span>' + (item.isSubstituted ? '代替：' + esc(item.nameJa) : '代替食材を選ぶ') + '</span><span aria-hidden="true">›</span></button>' : '') + '</li>';
    }).join('');
    // 開示注記はリンクがあるときだけ
    var note = document.querySelector('.ingredient-affiliate-note');
    if (note) note.hidden = !list.querySelector('a[data-affiliate]');
  }
  function renderSteps(steps, isAdapted) {
    var section = document.getElementById('steps'); if (!section) return;
    var html = '<h2>作り方</h2>', lastSection = null;
    steps.forEach(function (step) {
      if (step.sectionTitle && step.sectionTitle !== lastSection) { html += '<h3 class="step-section"><span class="step-section-accent"></span>' + esc(step.sectionTitle) + '</h3>'; lastSection = step.sectionTitle; }
      html += '<div class="step-card ' + (step.changeReason ? 'is-adapted' : '') + '" id="step-' + step.stepNumber + '"><div class="step-card-head"><span class="step-number">' + step.stepNumber + '</span>' + (step.durationMinutes ? '<span class="step-duration">約' + fmtMinutes(step.durationMinutes) + '</span>' : '') + (step.changeReason ? '<span class="adapted-step-label">代替に合わせて変更</span>' : '') + '</div>' + (step.imageHtml || '') + (step.imageHtml && isAdapted ? '<p class="step-image-note">標準レシピでの見た目です' + (step.changeReason ? '。手順が一部異なります' : '') + '</p>' : '') + renderStepBody(step) + (step.changeReason ? '<p class="adapted-step-reason">' + esc(step.changeReason) + '</p>' : '') + '</div>';
    }); section.innerHTML = html;
  }
  function scoreFor(options) { return Math.max(0, Math.min(100, 100 + options.reduce(function (sum, selected) { var ingredient=data.ingredients.find(function(item){return item.id===selected.ingredientId;}); return ingredient && ingredient.role === 'garnish' ? sum : sum + selected.option.authenticityImpact; }, 0))); }
  function scoreLabel(score) { return score >= 90 ? '本場そのもの' : score >= 80 ? '本場に近い' : score >= 70 ? '悪くはない' : 'もはや別料理'; }
  function renderScore(options) {
    var score = scoreFor(options), value = document.getElementById('authenticity-score'), description = document.getElementById('authenticity-description'), selected = document.getElementById('selected-substitutions');
    if (value) value.textContent = String(score);
    if (description) description.textContent = options.length ? scoreLabel(score) + '。選んだ代替による味・食感・手順への影響を材料欄と作り方に反映しています。' : '標準レシピの食材と手順です。代替食材を選ぶと、味・食感・工程への影響とともにスコアが変わります。';
    if (selected) { selected.hidden = !options.length; selected.innerHTML = options.map(function (item) { var ingredient=data.ingredients.find(function(candidate){return candidate.id===item.ingredientId;});var impact=ingredient&&ingredient.role==='garnish'?0:item.option.authenticityImpact;return '<span>' + esc(item.option.nameJa) + ' <strong>' + (impact === 0 ? '±0' : impact) + '</strong></span>'; }).join(''); }
  }
  function render() {
    var options = selectedOptions();
    currentIngredients = adaptedIngredients(options);
    renderIngredients(currentIngredients); renderSteps(adaptedSteps(options), options.length > 0); renderScore(options);
    ['ingredient-servings-label','servings-output'].forEach(function (id) { var el=document.getElementById(id); if(el)el.textContent=String(state.servings); });
    var meta=document.getElementById('recipe-meta-servings'); if(meta)meta.textContent=state.servings+'人分';
    var minus=document.getElementById('servings-minus'), plus=document.getElementById('servings-plus'); if(minus)minus.disabled=state.servings<=data.recipe.minServings;if(plus)plus.disabled=state.servings>=data.recipe.maxServings;
    bindSubstitutionTriggers();
  }

  function optionHtml(ingredient, option, selectedId) {
    var impact = option ? option.authenticityImpact : 0;
    var label = option ? option.nameJa : ingredient.nameJa;
    var sub = option ? option.flavorImpact : '標準（本場の食材）';
    var details = option ? [].concat(option.textureImpact || [], option.procedureChanges || [], option.notes || []).filter(Boolean) : [];
    var value = option ? option.id : '';
    return '<label class="substitution-option ' + (selectedId === value ? 'is-selected' : '') + '"><input type="radio" name="substitution" value="' + esc(value) + '" ' + (selectedId === value ? 'checked' : '') + '><span class="substitution-option-main"><strong>' + esc(label) + '</strong><small>' + esc(sub) + '</small>' + (details.length ? '<em>' + esc(details.join('／')) + '</em>' : '') + '</span><span class="substitution-impact impact-' + (impact === 0 ? 'none' : impact >= -10 ? 'minor' : 'major') + '">' + (impact === 0 ? '変化なし' : impact + ' pts') + '</span></label>';
  }
  function openDialog(ingredientId) {
    var ingredient = data.ingredients.find(function (item) { return item.id === ingredientId; }); if (!ingredient || !dialog) return;
    activeIngredientId = ingredientId;
    document.getElementById('substitution-dialog-title').textContent = ingredient.nameJa;
    document.getElementById('substitution-dialog-subtitle').textContent = ingredient.nameOriginal || '';
    var selectedId = state.selections[ingredientId] || '';
    var variants = ingredient.substitutionOptions.filter(function (o) { return o.variantType === 'authentic_variant'; });
    var substitutes = ingredient.substitutionOptions.filter(function (o) { return o.variantType !== 'authentic_variant'; });
    var html = '<section><h3>標準食材</h3>' + optionHtml(ingredient, null, selectedId) + '</section>';
    if (variants.length) html += '<section><h3>本場のバリエーション</h3>' + variants.map(function (o) { return optionHtml(ingredient,o,selectedId); }).join('') + '</section>';
    if (substitutes.length) html += '<section><h3>代わりに使える食材</h3>' + substitutes.map(function (o) { return optionHtml(ingredient,o,selectedId); }).join('') + '</section>';
    document.getElementById('substitution-options').innerHTML = html;
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
    lockPageScroll();
  }

  var glossaryDialog = document.getElementById('glossary-dialog');
  var glossaryTrigger = null;
  var activeTerm = null;
  function openGlossary(trigger) {
    var term = (data.glossary || []).find(function (item) { return item.id === trigger.getAttribute('data-glossary-trigger'); });
    if (!term || !glossaryDialog) return;
    glossaryTrigger = trigger;
    activeTerm = term;
    document.getElementById('glossary-dialog-title').textContent = term.term;
    document.getElementById('glossary-dialog-gloss').textContent = term.gloss;
    document.getElementById('glossary-dialog-description').textContent = term.description;
    var learnLink = document.getElementById('glossary-dialog-learn');
    learnLink.hidden = !term.learn;
    if (term.learn) {
      learnLink.textContent = term.learn.title + ' →';
      learnLink.setAttribute('href', term.learn.path);
    } else {
      learnLink.removeAttribute('href');
      learnLink.textContent = '';
    }
    lockPageScroll();
    glossaryDialog.showModal();
    track('glossary_term_opened', { recipe_id: data.recipe.id, recipe_slug: pageInfo.recipe_slug || '', term: term.term, source: 'recipe_step' });
  }
  // Event delegation also covers steps rebuilt after serving or substitution changes.
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-glossary-trigger]');
    if (trigger) openGlossary(trigger);
  });
  if (glossaryDialog) {
    glossaryDialog.addEventListener('close', function () {
      unlockPageScroll();
      if (glossaryTrigger && glossaryTrigger.isConnected) glossaryTrigger.focus({ preventScroll: true });
      activeTerm = null;
    });
    glossaryDialog.addEventListener('click', function (event) {
      if (event.target !== glossaryDialog) return;
      var bounds = glossaryDialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) glossaryDialog.close();
    });
    document.getElementById('glossary-dialog-learn').addEventListener('click', function () {
      if (activeTerm && activeTerm.learn) track('glossary_learn_opened', { recipe_id: data.recipe.id, recipe_slug: pageInfo.recipe_slug || '', term: activeTerm.term, series_slug: activeTerm.learn.seriesSlug });
    });
  }

  function lockPageScroll() {
    if (document.documentElement.classList.contains('dialog-open')) return;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('dialog-open');
    document.body.classList.add('dialog-open');
    document.body.style.top = '-' + lockedScrollY + 'px';
  }

  function unlockPageScroll() {
    if (!document.documentElement.classList.contains('dialog-open')) return;
    document.documentElement.classList.remove('dialog-open');
    document.body.classList.remove('dialog-open');
    document.body.style.top = '';
    window.scrollTo(0, lockedScrollY);
  }
  function bindSubstitutionTriggers() {
    document.querySelectorAll('[data-substitution-trigger]').forEach(function (button) { button.onclick = function () { openDialog(button.getAttribute('data-substitution-trigger')); }; });
  }

  var minus = document.getElementById('servings-minus'), plus = document.getElementById('servings-plus');
  if (minus) minus.addEventListener('click', function () { changeServings(Math.max(data.recipe.minServings, state.servings - 1)); });
  if (plus) plus.addEventListener('click', function () { changeServings(Math.min(data.recipe.maxServings, state.servings + 1)); });
  if (dialog) dialog.addEventListener('close', function () {
    if (dialog.returnValue === 'confirm' && activeIngredientId != null) {
      var chosen = dialog.querySelector('input[name="substitution"]:checked');
      var chosenId = chosen && chosen.value ? chosen.value : null;
      var ingredient = data.ingredients.find(function (item) { return item.id === activeIngredientId; });
      var option = ingredient && chosenId ? ingredient.substitutionOptions.find(function (o) { return o.id === chosenId; }) : null;
      var previous = state.selections[activeIngredientId] || null;
      state.selections[activeIngredientId] = chosenId;
      // 標準食材以外を確定したときだけ送る（標準に戻す操作は価値体験ではなく取り消し）
      if (option && chosenId !== previous) {
        window.TABELIA_ENGAGED.substitution = true;
        // 代替が伝わった瞬間にだけアプリ導線を出す（標準に戻したときは出さない）。
        // Android はアプリが未リリースで App Store からインストールできないため出さない
        // （オーガニック流入の約23%。Android 版を出したらこの判定を消す）。
        var inlineCta = document.querySelector('.ingredient-app-cta');
        if (inlineCta && !/Android/i.test(navigator.userAgent)) inlineCta.hidden = false;
        track('substitution_selected', {
          recipe_slug: pageInfo.recipe_slug || '',
          ingredient_name: ingredient.nameJa,
          option_name: option.nameJa,
          option_type: option.variantType === 'authentic_variant' ? 'authentic_variant' : 'substitute',
          authenticity_impact: ingredient.role === 'garnish' ? 0 : option.authenticityImpact,
        });
      }
      render();
    }
    unlockPageScroll();
    // Confirming rebuilds the list, replacing the dialog's original trigger.
    // Restore keyboard focus without moving the independently scrolled rail.
    var trigger = Array.from(document.querySelectorAll('[data-substitution-trigger]')).find(function (button) {
      return button.getAttribute('data-substitution-trigger') === activeIngredientId;
    });
    if (trigger) trigger.focus({ preventScroll: true });
  });
  bindSubstitutionTriggers(); render();
})();
