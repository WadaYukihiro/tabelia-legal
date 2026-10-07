(function(){
var copy={"root":"/en/recipes/","country":"Cuisine","all":"All cuisines","search":"Search recipes or ingredients","title":"Find a recipe","difficulty":"Difficulty","any":"All","featured":"Featured recipes","results":"Search results","empty":"No recipes match these filters","error":"Search could not be loaded.","retry":"Retry","more":"Show more","reset":"Reset filters","count":"recipes","countries":["Italy","France","Spain"]};
var input=document.getElementById('discovery-query'), country=document.getElementById('discovery-country'), difficulty=document.getElementById('discovery-difficulty'), results=document.getElementById('discovery-results'), status=document.getElementById('discovery-status'), heading=document.getElementById('discovery-heading'), more=document.getElementById('discovery-more'), retry=document.getElementById('discovery-retry');
if(!input)return;
const LATIN_LIGATURES = {
    'œ': 'oe', 'æ': 'ae', 'ß': 'ss', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th',
};
const SMALL_KANA_TO_LARGE = {
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
    'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
};
const KANJI_READINGS = [
    ['薩摩芋', 'さつまいも'],
    ['玉ねぎ', 'たまねぎ'], ['玉葱', 'たまねぎ'],
    ['茄子', 'なす'], ['烏賊', 'いか'], ['牛蒡', 'ごぼう'], ['大蒜', 'にんにく'],
    ['南瓜', 'かぼちゃ'], ['人参', 'にんじん'], ['胡瓜', 'きゅうり'],
    ['牛肉', 'ぎゅうにく'], ['豚肉', 'ぶたにく'], ['鶏肉', 'とりにく'],
    ['蛸', 'たこ'], ['葱', 'ねぎ'], ['韮', 'にら'], ['蕪', 'かぶ'], ['茄', 'なす'],
];
const SEPARATORS = /[\s　・･、。，,．.'’‘`´\-‐–—―_~〜～:：;；/／&＆!！?？()（）[\]「」『』【】"“”]/g;
const cache = new Map();
const CACHE_LIMIT = 4000;
function normalizeSearchText(input) {
    const hit = cache.get(input);
    if (hit !== undefined)
        return hit;
    let s = input.normalize('NFKC').toLowerCase();
    s = s.replace(/[œæßøłđðþ]/g, (ch) => { var _a; return (_a = LATIN_LIGATURES[ch]) !== null && _a !== void 0 ? _a : ch; });
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    for (const [kanji, reading] of KANJI_READINGS)
        s = s.split(kanji).join(reading);
    s = s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    s = s.replace(/ゔぁ/g, 'ば').replace(/ゔぃ/g, 'び').replace(/ゔぇ/g, 'べ').replace(/ゔぉ/g, 'ぼ').replace(/ゔ/g, 'ぶ');
    s = s.replace(/っ/g, '');
    s = s.replace(/[ぁぃぅぇぉゃゅょゎ]/g, (ch) => { var _a; return (_a = SMALL_KANA_TO_LARGE[ch]) !== null && _a !== void 0 ? _a : ch; });
    s = s.replace(/ー/g, '');
    s = s.replace(SEPARATORS, '');
    if (cache.size >= CACHE_LIMIT)
        cache.clear();
    cache.set(input, s);
    return s;
}
function foldKanaVoicing(key) {
    return key.normalize('NFD').replace(/[゙゚]/g, '');
}
function searchTokens(query) {
    return query
        .split(/[\s　・･,、]+/)
        .map((t) => normalizeSearchText(t))
        .filter((t) => t.length > 0);
}
function searchKeyIncludes(haystackKey, needleKey) {
    if (needleKey.length === 0)
        return true;
    if (haystackKey.length === 0)
        return false;
    if (haystackKey.includes(needleKey))
        return true;
    return foldKanaVoicing(haystackKey).includes(foldKanaVoicing(needleKey));
}
function rankNameMatch(keys, query) {
    const tokens = searchTokens(query);
    if (tokens.length === 0)
        return 0;
    const joined = tokens.join('');
    let best = 0;
    for (const key of keys) {
        if (!key)
            continue;
        if (key === joined || foldKanaVoicing(key) === foldKanaVoicing(joined))
            return 100;
        if (key.startsWith(joined) || foldKanaVoicing(key).startsWith(foldKanaVoicing(joined)))
            best = Math.max(best, 80);
        else if (searchKeyIncludes(key, joined))
            best = Math.max(best, 60);
    }
    if (best > 0)
        return best;
    const all = keys.join(' ');
    return tokens.every((t) => searchKeyIncludes(all, t)) ? 50 : 0;
}

var data=[], limit=24, loaded=false;
function restore(){var p=new URLSearchParams(location.search);input.value=p.get('q')||'';country.value=p.get('country')||'';difficulty.value=p.get('difficulty')||'';}
function text(tag,value){var el=document.createElement(tag);el.textContent=value;return el;}
function render(){
var query=input.value.trim(), terms=searchTokens(query);
var matches=data.map(function(r,order){var names=(r.names||[r.title,r.nameOriginal]).filter(Boolean).map(normalizeSearchText), keys=names.concat((r.ingredients||[]).map(normalizeSearchText));var match=terms.every(function(t){return keys.some(function(k){return searchKeyIncludes(k,t);});});return {r:r,order:order,match:match,score:rankNameMatch(names,query)};}).filter(function(m){return m.match&&(!country.value||m.r.cuisineCode===country.value)&&(!difficulty.value||m.r.difficulty===Number(difficulty.value));}).sort(function(a,b){return (query?b.score-a.score:0)||(a.r.featuredRank||9999)-(b.r.featuredRank||9999)||a.order-b.order;});
heading.textContent=query||country.value||difficulty.value?copy.results:copy.featured;
results.replaceChildren();status.textContent=loaded?(matches.length?matches.length+' '+copy.count:copy.empty):'';
matches.slice(0,limit).forEach(function(m){var r=m.r, link=text('a','');link.className='discovery-card';link.href=copy.root+r.slug+'/';if(r.hero){var img=document.createElement('img');img.src=r.hero;img.alt='';img.loading='lazy';img.width=320;img.height=240;link.append(img);}var body=text('div','');body.className='discovery-card-body';body.append(text('h3',r.nameOriginal||r.title));if(r.title!==r.nameOriginal)body.append(text('p',r.title));else if(r.nameJa||r.subtitle)body.append(text('p',r.nameJa||r.subtitle));body.append(text('small',r.cuisine+' · '+copy.difficulty+' '+'★'.repeat(r.difficulty)+'☆'.repeat(5-r.difficulty)));link.append(body);results.append(link);});more.hidden=matches.length<=limit;
}
function update(){limit=24;var p=new URLSearchParams();if(input.value.trim())p.set('q',input.value.trim());if(country.value)p.set('country',country.value);if(difficulty.value)p.set('difficulty',difficulty.value);history.replaceState(null,'',location.pathname+(p.toString()?'?'+p.toString():''));document.dispatchEvent(new Event('discoverychange'));render();}
function load(){status.textContent='…';retry.hidden=true;fetch(copy.root+'search-index.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw Error();return r.json();}).then(function(json){if(!Array.isArray(json))throw Error();data=json;loaded=true;render();}).catch(function(){status.textContent=copy.error;retry.hidden=false;});}
input.addEventListener('input',function(e){if(!e.isComposing)update();});input.addEventListener('compositionend',update);country.addEventListener('change',update);difficulty.addEventListener('change',update);document.getElementById('discovery-reset').addEventListener('click',function(){input.value='';country.value='';difficulty.value='';update();input.focus();});more.addEventListener('click',function(){var previous=limit;limit+=24;render();var next=results.children[previous];if(next)next.focus();});retry.addEventListener('click',load);window.addEventListener('popstate',function(){restore();limit=24;render();});restore();load();
})();