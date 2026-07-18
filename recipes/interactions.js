(function () {
  'use strict';

  var dataNode = document.getElementById('recipe-interaction-data');
  if (!dataNode) return;

  var data;
  try { data = JSON.parse(dataNode.textContent || '{}'); } catch (_) { return; }
  if (!data.recipe || !Array.isArray(data.ingredients) || !Array.isArray(data.steps)) return;

  var state = { servings: data.recipe.baseServings, selections: {} };
  var dialog = document.getElementById('substitution-dialog');
  var activeIngredientId = null;
  var lockedScrollY = 0;
  var countUnits = new Set(['枝','個','枚','本','片','束','株','房','粒','缶','パック','袋','セット','尾','切れ','羽','頭','茎','ひとつまみ','ひとにぎり','適量']);

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function roundStep(value, step) { return Math.round(value / step) * step; }
  function compactNumber(value) {
    var rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }
  function fmtQty(value, unit) {
    if (value <= 0) return '少量';
    if (countUnits.has(unit)) return String(Math.max(1, Math.round(value)));
    if (unit === '大さじ' || unit === '小さじ') {
      var spoon = roundStep(value, 0.5); return spoon <= 0 ? '少量' : compactNumber(spoon);
    }
    if (unit === 'カップ') {
      var cup = roundStep(value, 0.25); return cup <= 0 ? '少量' : compactNumber(cup);
    }
    if (unit === 'g' || unit === 'ml') {
      if (value >= 100) return String(roundStep(value, 5));
      if (value >= 10) return String(Math.round(value));
      var small = roundStep(value, 0.5); return small <= 0 ? '少量' : compactNumber(small);
    }
    return compactNumber(value);
  }
  function fmtQtyWithUnit(value, unit) {
    if (unit === '適量') return '適量';
    var quantity = fmtQty(value, unit);
    if (!unit) return quantity;
    return unit === '大さじ' || unit === '小さじ' ? unit + quantity : quantity + unit;
  }
  function fmtMinutes(minutes) {
    var hours = Math.floor(minutes / 60), rest = minutes % 60;
    if (hours && rest) return hours + '時間' + rest + '分';
    if (hours) return hours + '時間';
    return minutes + '分';
  }
  function scaleQty(base, role, unit, behavior) {
    var ratio = state.servings / data.recipe.baseServings;
    if (behavior === 'fixed') return base;
    if (behavior === 'sublinear') return base * Math.pow(ratio, 0.75);
    if (behavior === 'linear') return base * ratio;
    if (unit === 'ml' && base >= 40) return base * ratio;
    if (role === 'flavor') return base * Math.pow(ratio, 0.75);
    return base * ratio;
  }

  function parseToken(token) {
    if (token.indexOf('/') < 0) return parseFloat(token);
    var parts = token.split('/').map(Number);
    return parts[1] ? parts[0] / parts[1] : parseFloat(token);
  }
  function scaleInstruction(text) {
    if (!text || state.servings === data.recipe.baseServings) return text || '';
    var ratio = state.servings / data.recipe.baseServings;
    var quantity = '\\d+(?:\\.\\d+)?(?:/\\d+(?:\\.\\d+)?)?';
    var result = text.replace(new RegExp('(' + quantity + ')(g|kg|ml|mL|L|リットル|cc)', 'g'), function (_, n, unit) {
      var normalized = unit === 'mL' ? 'ml' : unit;
      return fmtQty(parseToken(n) * ratio, normalized) + normalized;
    });
    result = result.replace(new RegExp('(大さじ|小さじ|カップ)(' + quantity + ')', 'g'), function (_, unit, n) {
      return unit + fmtQty(parseToken(n) * ratio, unit);
    });
    var units = Array.from(countUnits).sort(function (a, b) { return b.length - a.length; }).join('|');
    return result.replace(new RegExp('(' + quantity + ')(' + units + ')', 'g'), function (_, n, unit) {
      return fmtQty(parseToken(n) * ratio, unit) + unit;
    });
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
        notes: ingredient.notes, isSubstituted: Boolean(option), substitutionOptionId: selectedId
      };
    });
    options.forEach(function (selected) {
      (selected.option.ingredientPatches || []).forEach(function (patch) {
        if (patch.action === 'add') {
          items.push({
            standardIngredientId: patch.targetStandardIngredientId || 'variant:' + selected.option.id + ':' + items.length,
            standardNameJa: patch.nameJa || '', nameJa: patch.nameJa || '', baseQuantity: patch.quantity || 0,
            unit: patch.unit || '', role: patch.role || 'essential', scalingBehavior: patch.scalingBehavior || null,
            notes: patch.notes || null, isSubstituted: true, substitutionOptionId: selected.option.id
          });
          return;
        }
        var index = findIngredientIndex(items, patch);
        if (index < 0) return;
        if (patch.action === 'remove') { items.splice(index, 1); return; }
        var current = items[index];
        items[index] = Object.assign({}, current, {
          nameJa: patch.nameJa != null ? patch.nameJa : current.nameJa,
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

  function supportBlock(label, items) {
    if (!items || !items.length) return '';
    return '<div class="support-block"><p class="step-block-heading">' + esc(label) + '</p>' + items.map(function (item) { return '<p class="support-text">' + esc(scaleInstruction(item)) + '</p>'; }).join('') + '</div>';
  }
  function renderStepBody(step) {
    var structured = step.title || step.actionItems.length || step.parallelItems.length || step.completionCriteria.length || step.cautionItems.length || step.tipItems.length;
    if (!structured) return '<p>' + esc(scaleInstruction(step.instruction)) + '</p>';
    var html = step.title ? '<p class="step-title">' + esc(step.title) + '</p>' : '';
    var items = orderedItems(step);
    if (items.length) html += '<ul class="action-list">' + items.map(function (item, index) {
      var text = scaleInstruction(item.text);
      return '<li class="action-item"><span class="action-item-number">' + (index + 1) + '</span><span class="action-item-body">' + (item.kind === 'parallel' ? '<span class="parallel-label">並行</span>' : '') + '<span class="action-item-text">' + esc(text) + '</span></span></li>';
    }).join('') + '</ul>'; else if (step.instruction) html += '<p>' + esc(scaleInstruction(step.instruction)) + '</p>';
    return html + supportBlock('完了の目安', step.completionCriteria) + supportBlock('注意点', step.cautionItems) + supportBlock('補足', step.tipItems);
  }

  function renderIngredients(items) {
    var list = document.querySelector('.ingredient-list'); if (!list) return;
    list.innerHTML = items.map(function (item) {
      var standard = data.ingredients.find(function (ingredient) { return ingredient.id === item.standardIngredientId; });
      var hasOptions = standard && standard.substitutionOptions.length;
      return '<li data-ingredient-row="' + esc(item.standardIngredientId) + '" class="' + (item.isSubstituted ? 'is-substituted' : '') + '">' +
        '<span class="ingredient-name" data-ingredient-name>' + esc(item.nameJa) + '</span><span class="ingredient-qty" data-ingredient-qty>' + esc(fmtQtyWithUnit(item.quantity, item.unit)) + '</span>' +
        (item.notes ? '<span class="ingredient-notes">' + esc(item.notes) + '</span>' : '') +
        (hasOptions ? '<button type="button" class="substitution-trigger" data-substitution-trigger="' + esc(item.standardIngredientId) + '"><span>' + (item.isSubstituted ? '代替：' + esc(item.nameJa) : '代替食材を選ぶ') + '</span><span aria-hidden="true">›</span></button>' : '') + '</li>';
    }).join('');
  }
  function renderSteps(steps) {
    var section = document.getElementById('steps'); if (!section) return;
    var html = '<h2>作り方</h2>', lastSection = null;
    steps.forEach(function (step) {
      if (step.sectionTitle && step.sectionTitle !== lastSection) { html += '<h3 class="step-section"><span class="step-section-accent"></span>' + esc(step.sectionTitle) + '</h3>'; lastSection = step.sectionTitle; }
      html += '<div class="step-card ' + (step.changeReason ? 'is-adapted' : '') + '" id="step-' + step.stepNumber + '"><div class="step-card-head"><span class="step-number">' + step.stepNumber + '</span>' + (step.durationMinutes ? '<span class="step-duration">約' + fmtMinutes(step.durationMinutes) + '</span>' : '') + (step.changeReason ? '<span class="adapted-step-label">代替に合わせて変更</span>' : '') + '</div>' + renderStepBody(step) + (step.changeReason ? '<p class="adapted-step-reason">' + esc(step.changeReason) + '</p>' : '') + '</div>';
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
    renderIngredients(adaptedIngredients(options)); renderSteps(adaptedSteps(options)); renderScore(options);
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
  if (minus) minus.addEventListener('click', function () { state.servings = Math.max(data.recipe.minServings, state.servings - 1); render(); });
  if (plus) plus.addEventListener('click', function () { state.servings = Math.min(data.recipe.maxServings, state.servings + 1); render(); });
  if (dialog) dialog.addEventListener('close', function () {
    if (dialog.returnValue === 'confirm' && activeIngredientId != null) {
      var chosen = dialog.querySelector('input[name="substitution"]:checked'); state.selections[activeIngredientId] = chosen && chosen.value ? chosen.value : null; render();
    }
    unlockPageScroll();
  });
  bindSubstitutionTriggers(); render();
})();
