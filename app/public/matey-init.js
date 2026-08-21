/* Matey Init — wires Whisper, mic, chat syntax, license, notes, pull-hint */
(function () {
  'use strict';
  function initWhisperUI() {
    var c=document.getElementById('whisper-models'),s=document.getElementById('whisper-status'),p=document.getElementById('whisper-progress'),f=document.getElementById('whisper-progress-fill'),t=document.getElementById('whisper-progress-text');
    if(!c||!s)return;
    var models=MateyWhisper.getModelOptions(),stored=MateyWhisper.getStoredModel(),state=MateyWhisper.getState();
    if(state.ready){var m=models.find(function(x){return x.id===stored;});s.textContent='Loaded: '+(m?m.label:stored);}
    c.innerHTML=models.map(function(m){var l=state.ready&&stored===m.id,il=state.loading&&stored===m.id;return'<div class="whisper-model-card"><div class="whisper-model-info"><span class="whisper-model-name">'+m.label+'</span><span class="whisper-model-desc">'+m.desc+'</span></div><button class="whisper-model-btn" data-model="'+m.id+'"'+(il?' disabled':'')+'>'+(l?'✓ Loaded':il?'Loading…':'Download')+'</button></div>';}).join('');
    c.querySelectorAll('.whisper-model-btn').forEach(function(b){b.addEventListener('click',function(){var id=b.getAttribute('data-model');MateyWhisper.storeModel(id);b.disabled=true;b.textContent='Loading…';p.style.display='flex';f.style.width='0%';t.textContent='Downloading model…';MateyWhisper.loadModel(id,function(pr){f.style.width=pr+'%';if(pr>=100)t.textContent='Initializing…';}).then(function(){p.style.display='none';s.textContent='Loaded: '+(models.find(function(x){return x.id===id;})||{}).label||id;initWhisperUI();}).catch(function(e){p.style.display='none';b.disabled=false;b.textContent='Retry';t.textContent='Error';});});});
  }
  function initMic() {
    var b=document.querySelector('.chat-mic'),f=document.querySelector('.chat-field');if(!b)return;
    var r,ch=[],rec=false;
    b.addEventListener('click',function(){
      if(!MateyWhisper.getState().ready){if(f){f.placeholder='Download a model in Settings → Local AI';setTimeout(function(){if(f)f.placeholder='Type a message…';},2500);}return;}
      if(rec){rec=false;r.stop();b.style.color='';b.textContent='';}else{
        navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){ch=[];r=new MediaRecorder(s);rec=true;b.style.color='#f87171';b.textContent='';r.ondataavailable=function(e){ch.push(e.data);};r.onstop=function(){var bl=new Blob(ch,{type:'audio/webm'});if(f)f.placeholder='Transcribing…';MateyWhisper.transcribe(bl).then(function(res){var t=res&&res.text?res.text:'';if(f){f.value=t;f.placeholder='Type a message…';}}).catch(function(){if(f)f.placeholder='Transcription failed';});s.getTracks().forEach(function(t){t.stop();});};r.start();}).catch(function(){alert('Microphone denied');});
      }
    });
  }
  function initChatSyntax() {
    var f=document.querySelector('.chat-field'),body=document.querySelector('.chat-dialog-body');if(!f||!body)return;
    function add(msg,cls){var d=document.createElement('div');d.className='chat-bubble '+(cls||'');d.textContent=msg;body.appendChild(d);body.scrollTop=body.scrollHeight;return d;}
    if(window.MateyAdaptive&&MateyAdaptive.suggestPrompt){
      var originalPlaceholder=f.placeholder||'Type a message…';
      f.addEventListener('input',function(){
        var q=f.value.trim();
        if(!q){f.placeholder=originalPlaceholder;return;}
        var s=MateyAdaptive.suggestPrompt(q);
        if(s)f.placeholder=s;
      });
      f.addEventListener('blur',function(){f.placeholder=originalPlaceholder;});
    }
    f.addEventListener('keydown',function(e){if(e.key!=='Enter')return;var v=f.value.trim();if(!v)return;add(v,'user');var p=MateySyntax.parse(v);if(p){switch(p.type){case'scratchpad':add('Scratchpad: '+p.content.substring(0,60)+'…','system');break;case'permanent':add('Saved ['+p.topic+']: '+p.content.substring(0,60)+'…','system');break;case'silent':add('Queued: '+p.content.substring(0,60)+'…','system');break;case'kb-query':var hits = window.MateyRecall ? MateyRecall.rank(p.content) : (p.results||[]);if(hits.length){add(hits.length+' answer'+(hits.length>1?'s':'')+':','system');hits.forEach(function(r){add('['+(r.source||'note')+'] '+(r.relevance?'('+r.relevance+'%) ':'')+(r.text||'').substring(0,80)+'…','system');});}else add('No relevant notes found','system');break;case'priority':add('Priority: '+p.content.substring(0,60)+'…','system');break;case'math':add('= '+p.result,'system');break;}}else{askAI(v,add);}f.value='';e.preventDefault();});
  }
  function askAI(text,add){
    if(!window.MateyByok||!MateyByok.hasProviders()){add('Add an API provider in Settings → Custom to enable AI replies.','system');return;}
    var thinking=add('Matey is thinking…','system ai-thinking');
    var profile='';try{profile=localStorage.getItem('matey-profile')||'';}catch(e){}
    var adaptiveContext='';if(window.MateyAdaptive&&MateyAdaptive.buildSystemContext)adaptiveContext=MateyAdaptive.buildSystemContext();
    var messages=[{role:'system',content:'You are Matey, a concise personal AI concierge.'+(profile?' The user shared this about themselves: '+profile:'')+(adaptiveContext?' '+adaptiveContext:'')+' Keep replies short and helpful.'},{role:'user',content:text}];
    MateyByok.chat(messages).then(function(reply){thinking.textContent=reply;thinking.classList.remove('ai-thinking');if(window.MateyBehavior)MateyBehavior.trackChatResponse(reply);}).catch(function(err){thinking.textContent=(err&&err.message)?err.message:'AI request failed. Check provider settings.';thinking.classList.remove('ai-thinking');});
  }
  function initLicenseUI() {
    var ab=document.querySelector("#sec-about .settings-section-body");if(!ab)return;var card=ab.querySelector('.settings-about-card');if(!card||document.getElementById('license-row'))return;
    var lic=MateyLicense.get(),row=document.createElement('div');row.id='license-row';row.style.cssText='margin-top:16px;padding-top:16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;';
    var unlocked=lic.tier==='unlocked';
    row.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:15px;font-weight:var(--font-weight-medium);color:var(--text);">Matey</span><span style="font-size:13px;font-weight:var(--font-weight-medium);padding:4px 12px;border-radius:8px;'+(unlocked?'background:var(--accent);color:#000;':'background:var(--surface);color:var(--muted);')+'">'+(unlocked?'∞ Unlocked':'Free')+'</span></div>'+(unlocked?'<p style="font-size:12px;color:var(--muted);">One-time lifetime unlock — no subscription, no expiry. Thanks for supporting Matey.</p>':'<button id="upgrade-btn" style="border:none;background:var(--accent);color:#000;padding:10px;border-radius:12px;font:inherit;font-size:14px;font-weight:var(--font-weight-medium);cursor:pointer;">Unlock Matey ∞ — $'+MateyLicense.PRICE.toFixed(2)+' one-time</button><p style="font-size:12px;color:var(--muted);">Unlimited memory, Ask Matey recall, proactive actions, BYOK + local models, sync & more. One payment, yours forever.</p>');
    row.querySelector('#upgrade-btn')?.addEventListener('click',function(){MateyLicense.unlock();row.remove();initLicenseUI();});card.appendChild(row);
  }
  function renderNotes() {
    var el = document.getElementById('notes-list');
    if (!el || !window.MateySyntax) return;
    var data = MateySyntax.getAllNotes();
    var all = [];
    (data.permanent || []).forEach(function (n) { all.push({ type: 'permanent', content: n.content, topic: n.topic, time: n.created }); });
    (data.scratchpads || []).forEach(function (n) { all.push({ type: 'scratchpad', content: n.content, time: n.created }); });
    (data.priorities || []).forEach(function (n) { all.push({ type: 'priority', content: n.content, time: n.created }); });
    all.sort(function (a, b) { return (b.time || 0) - (a.time || 0); });
    if (!all.length) { el.innerHTML = '<p class="settings-placeholder">No notes yet. Use ** prefix in chat or Markdown to save permanent notes.</p>'; return; }
    el.innerHTML = all.slice(0, 50).map(function (n) {
      var date = new Date(n.time).toLocaleDateString();
      var typeIcon = n.type === 'permanent' ? '' : n.type === 'scratchpad' ? '(24h)' : '(!!)';
      var topicTag = n.topic ? ' <span style="font-size:10px;color:var(--accent);">' + n.topic + '</span>' : '';
      return '<div style="padding:10px 0;border-bottom:1px solid var(--border-subtle);font-size:13px;line-height:1.5;"><div style="display:flex;justify-content:space-between;align-items:flex-start;"><span style="color:var(--text);flex:1;min-width:0;">' + escHtml(n.content.substring(0, 120)) + (n.content.length > 120 ? '…' : '') + topicTag + '</span><span style="color:var(--muted);font-size:11px;white-space:nowrap;margin-left:8px;">' + typeIcon + ' ' + date + '</span></div></div>';
    }).join('');
  }
  function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function initLibSubsections() {
    document.querySelectorAll('.lib-sub-header').forEach(function (h) {
      h.addEventListener('click', function () {
        this.parentElement.classList.toggle('open');
      });
    });
  }
  function init(){
    initWhisperUI();initMic();initChatSyntax();initLicenseUI();renderNotes();initLibSubsections();
    // Re-render notes when settings panel opens
    var settings = document.getElementById('settings');
    if (settings) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
          if (m.attributeName === 'class' && settings.classList.contains('open')) {
            renderNotes();
            initLibSubsections();
          }
        });
      });
      observer.observe(settings, { attributes: true });
    }
    // Track page visit for adaptive ML
    if (window.MateyBehavior) {
      var page = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
      MateyBehavior.trackPage(page);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
