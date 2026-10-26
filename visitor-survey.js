// Anonymous, optional research survey. No analytics SDK or cookies are required.
(function () {
  'use strict';
  var CAMPAIGN = 'cooking-role-2026-10';
  var ENDPOINT = 'https://zyvkuzjemabnvbxwzxll.supabase.co/functions/v1/web-visitor-survey';
  var KEY = 'tabelia-survey-' + CAMPAIGN;
  var PENDING = KEY + '-pending';
  var ID_KEY = 'tabelia-reviewer-id';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!window.HTMLDialogElement || document.getElementById('visitor-survey')) return;
  if (/^\/(en\/|it\/)?(privacy|terms|commercial|support|404)(\/|\.|$)/.test(location.pathname)) return;
  var store, id;
  try {
    store = window.localStorage;
    store.setItem(KEY + '-test', '1'); store.removeItem(KEY + '-test');
    id = store.getItem(ID_KEY);
    if (!id || !UUID.test(id)) { id = crypto.randomUUID(); store.setItem(ID_KEY, id); }
  } catch (_) { return; } // A durable dismissal is required; otherwise do not interrupt visitors.

  var locale = (document.documentElement.lang || 'ja').slice(0, 2);
  var translations = {
    ja: { label:'１問だけご協力ください', title:'あなたと料理の関わりは？', purpose:'これからのTabeliaの機能づくりに役立てます。', hint:'当てはまるものをすべて選んでください', home:'家庭で料理を楽しむ', homeNote:'自分や家族、友人のために', professional:'飲食の仕事をしている', professionalNote:'調理・接客・店舗運営など', student:'料理・飲食を学んでいる', other:'その他', send:'回答を送信して完了', sending:'送信中…', close:'アンケートを閉じる', note:'回答せずに閉じても、次回から表示しません。', error:'送信できませんでした。もう一度お試しください。', expired:'アンケートの受付は終了しました。', thanks:'ご協力ありがとうございます。', selection:'つ選択中' },
    en: { label:'Please answer just one question', title:'How are you involved in cooking?', purpose:'Your answer will help shape future Tabelia features.', hint:'Choose all that apply', home:'I cook at home', homeNote:'For myself, family or friends', professional:'I work in food service', professionalNote:'Cooking, service or management', student:'I study cooking or food service', other:'Other', send:'Submit and finish', sending:'Sending…', close:'Close survey', note:'If you close this survey, it will not appear again.', error:'We could not send your answer. Please try again.', expired:'This survey has ended.', thanks:'Thank you for your help.', selection:' selected' },
    it: { label:'Solo una domanda per aiutarci', title:'Qual è il tuo rapporto con la cucina?', purpose:'La tua risposta ci aiuterà a sviluppare le prossime funzioni di Tabelia.', hint:'Scegli tutte le risposte che ti descrivono', home:'Cucino a casa', homeNote:'Per me, la famiglia o gli amici', professional:'Lavoro nella ristorazione', professionalNote:'Cucina, servizio o gestione', student:'Studio cucina o ristorazione', other:'Altro', send:'Invia e termina', sending:'Invio…', close:'Chiudi il sondaggio', note:'Se lo chiudi, il sondaggio non verrà più mostrato.', error:'Invio non riuscito. Riprova.', expired:'Il sondaggio è terminato.', thanks:'Grazie per il tuo contributo.', selection:' selezionate' }
  };
  var copy = translations[locale] || translations.en;
  var dialog, expiresAt = 0, selected = [], busy = false, finished = false, previousFocus, expirationTimer;
  function request(action, choices) {
    return fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', keepalive:true,
      body:JSON.stringify({browserId:id,action:action,choices:choices || []})
    }).then(function (response) {
      if (!response.ok) { var error=new Error('survey_request_failed');error.status=response.status;throw error; }
      return response.json();
    }).then(function (result) {
      if (!result || result.campaignId !== CAMPAIGN || typeof result.active !== 'boolean' || typeof result.closed !== 'boolean') throw new Error('invalid_response');
      return result;
    });
  }
  function markClosed() { try { store.setItem(KEY, 'closed'); } catch (_) {} }
  function closeLocally(message) {
    finished = true; clearTimeout(expirationTimer);
    if (dialog && dialog.open) dialog.close();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({preventScroll:true});
    if (message) {
      var toast = document.createElement('div'); toast.className='visitor-survey-toast'; toast.setAttribute('role','status'); toast.textContent=message;
      document.body.appendChild(toast); setTimeout(function(){toast.remove();},4500);
    }
  }
  // Persist unsent dismissals so closing remains permanent even while offline.
  function flushDismissal() {
    var pending; try { pending=store.getItem(PENDING); } catch (_) { return Promise.resolve(); }
    if (!pending) return Promise.resolve();
    return request('dismissed').then(function () { store.removeItem(PENDING); }).catch(function () {});
  }
  function dismiss() {
    if (finished) return;
    markClosed();
    try { store.setItem(PENDING,'dismissed'); } catch (_) {}
    closeLocally();
    flushDismissal();
  }
  window.addEventListener('online',flushDismissal);
  window.addEventListener('storage',function(e){if(e.key===KEY&&e.newValue==='closed')closeLocally();});
  flushDismissal();
  if (store.getItem(KEY)) return;

  function renderSelection() {
    dialog.querySelectorAll('[data-survey-choice]').forEach(function(button){
      var active=selected.indexOf(button.getAttribute('data-survey-choice'))!==-1;
      button.setAttribute('aria-pressed',String(active)); button.querySelector('.visitor-survey-check').textContent=active?'✓':'';
    });
    dialog.querySelector('[data-survey-status]').textContent=selected.length?selected.length+copy.selection:'';
    dialog.querySelector('[data-survey-submit]').disabled=busy||selected.length===0;
  }
  function show(config) {
    if (finished || store.getItem(KEY) || Date.now()>=expiresAt) return;
    // Give existing dialogs and consent choices priority. Recheck the campaign on every retry.
    if (document.querySelector('dialog[open], [aria-modal="true"], .consent-banner')) {
      setTimeout(function(){show(config);},1500); return;
    }
    dialog=document.createElement('dialog'); dialog.id='visitor-survey'; dialog.className='visitor-survey';
    dialog.setAttribute('aria-labelledby','visitor-survey-title'); dialog.setAttribute('aria-describedby','visitor-survey-purpose');
    // All copy comes from the static table above, never from the server or URL.
    function choice(value,primary) {
      return '<button type="button" class="visitor-survey-choice'+(primary?'':' visitor-survey-secondary')+'" data-survey-choice="'+value+'" aria-pressed="false">'+
        '<span class="visitor-survey-check" aria-hidden="true"></span>'+
        (primary?'<span class="visitor-survey-picture"><img src="/assets/survey-'+value+'-2026-10.jpg" alt="" width="640" height="480"></span>':'')+
        '<strong>'+copy[value]+'</strong>'+(primary?'<small>'+copy[value+'Note']+'</small>':'')+'</button>';
    }
    dialog.innerHTML='<div class="visitor-survey-head"><span class="visitor-survey-wordmark">Tabelia</span><button class="visitor-survey-close" type="button" aria-label="'+copy.close+'" data-survey-close>×</button></div>'+
      '<p class="visitor-survey-label">'+copy.label+'</p><h2 id="visitor-survey-title">'+copy.title+'</h2><p id="visitor-survey-purpose">'+copy.purpose+'</p><p class="visitor-survey-hint">'+copy.hint+'</p>'+
      '<div class="visitor-survey-choices" role="group" aria-labelledby="visitor-survey-title">'+choice('home',true)+choice('professional',true)+choice('student',false)+choice('other',false)+'</div>'+
      '<p class="visitor-survey-status" data-survey-status aria-live="polite"></p><p class="visitor-survey-error" data-survey-error role="alert" hidden></p>'+
      '<button type="button" class="visitor-survey-submit" data-survey-submit disabled><span>'+copy.send+'</span></button><p class="visitor-survey-note">'+copy.note+'</p>';
    dialog.querySelector('[data-survey-close]').addEventListener('click',dismiss);
    dialog.addEventListener('cancel',function(e){e.preventDefault();dismiss();});
    dialog.querySelectorAll('[data-survey-choice]').forEach(function(button){button.addEventListener('click',function(){
      if(busy)return;
      var value=button.getAttribute('data-survey-choice'),index=selected.indexOf(value);
      if(index!==-1)selected.splice(index,1);else{if(value==='other')selected=[];else selected=selected.filter(function(v){return v!=='other';});selected.push(value);}
      renderSelection();
    });});
    dialog.querySelector('[data-survey-submit]').addEventListener('click',function(){
      if(busy||!selected.length||finished)return;
      busy=true;renderSelection();dialog.querySelector('[data-survey-error]').hidden=true;
      dialog.querySelector('[data-survey-submit] span').textContent=copy.sending;
      request('submitted',selected.slice()).then(function(result){
        if(finished)return;
        if(result.closed){markClosed();closeLocally(result.closure==='submitted'?copy.thanks:null);}
        else if(!result.active){closeLocally(copy.expired);}
        else throw new Error('not_saved');
      }).catch(function(){
        if(finished)return;
        dialog.querySelector('[data-survey-error]').hidden=false;
        dialog.querySelector('[data-survey-error]').textContent=copy.error;
      }).finally(function(){busy=false;if(!finished){renderSelection();dialog.querySelector('[data-survey-submit] span').textContent=copy.send;}});
    });
    document.body.appendChild(dialog);previousFocus=document.activeElement;dialog.showModal();
    expirationTimer=setTimeout(function(){closeLocally(copy.expired);},Math.max(0,expiresAt-Date.now()));
    request('shown').then(function(result){if(result.closed){markClosed();closeLocally();}else if(!result.active)closeLocally();}).catch(function(error){if(error.status===429)closeLocally();});
  }
  // Server time controls the deadline even if the visitor's clock is incorrect.
  request('status').then(function(config){
    if(config.closed){markClosed();return;}
    if(!config.active)return;
    var duration=Date.parse(config.endsAt)-Date.parse(config.serverNow);
    if(!Number.isFinite(duration)||duration<=0||duration>7*86400000)return;
    expiresAt=Date.now()+duration;
    var stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/visitor-survey.css?v=20261026b';
    stylesheet.addEventListener('load',function(){setTimeout(function(){show(config);},1200);});
    document.head.appendChild(stylesheet);
  }).catch(function(){});
})();
