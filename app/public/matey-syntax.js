/* Matey Syntax Engine — ## ** // ?? !! parser + KB search + polishing */
(function () {
  'use strict';
  var VAULT_KEY = 'matey-vault', SESSION_KEY = 'matey-session-notes', PRIORITY_KEY = 'matey-priority', RECAP_KEY = 'matey-recap';
  function vault() { try { return JSON.parse(localStorage.getItem(VAULT_KEY) || '[]'); } catch (e) { return []; } }
  function saveVault(d) { localStorage.setItem(VAULT_KEY, JSON.stringify(d)); }
  function sessions() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || '[]'); } catch (e) { return []; } }
  function saveSessions(d) { localStorage.setItem(SESSION_KEY, JSON.stringify(d)); }
  function priorities() { try { return JSON.parse(localStorage.getItem(PRIORITY_KEY) || '[]'); } catch (e) { return []; } }
  function savePriorities(d) { localStorage.setItem(PRIORITY_KEY, JSON.stringify(d)); }
  var TOPICS = ['Grooming','Wardrobe','Culinary','Lifestyle','Work','Tech','Health','Travel','Finance'];
  function categorize(text) {
    var l=text.toLowerCase();
    if(/groom|skin|hair|shave|beard|face|skincare|perfume|cologne/.test(l))return'Grooming';
    if(/cloth|outfit|shirt|pant|shoe|fashion|dress|wardrobe|style/.test(l))return'Wardrobe';
    if(/cook|recipe|food|meal|diet|restaurant|eat|chef|bake/.test(l))return'Culinary';
    if(/gym|workout|read|book|meditat|yoga|hobby|learn|music/.test(l))return'Lifestyle';
    if(/work|job|office|meeting|project|deadline|client|code|dev|api/.test(l))return'Work';
    if(/tech|software|app|bug|fix|deploy|server|git|docker/.test(l))return'Tech';
    if(/health|doctor|sleep|diet|exercise|run|mental/.test(l))return'Health';
    if(/travel|trip|flight|hotel|vacation|abroad/.test(l))return'Travel';
    if(/money|budget|invest|save|stock|crypto|bill/.test(l))return'Finance';
    return TOPICS[Math.floor(Math.random()*TOPICS.length)];
  }
  function addRecap(txt,type,topic) {
    try{var r=JSON.parse(localStorage.getItem(RECAP_KEY)||'[]');r.unshift({text:txt.substring(0,200),type:type,topic:topic,time:Date.now()});localStorage.setItem(RECAP_KEY,JSON.stringify(r.slice(0,200)));}catch(e){}
  }
  function parse(text) {
    if(!text||!text.trim())return null;var t=text.trim(),now=Date.now();
    if(/^##\s/.test(t)){var n={type:'scratchpad',content:t.replace(/^##\s*/,''),created:now,expires:now+86400000};var s=sessions();s.unshift(n);saveSessions(s.slice(0,50));return n;}
    if(/^\*\*\s/.test(t)){var tp=categorize(t);var n={type:'permanent',content:t.replace(/^\*\*\s*/,''),created:now,topic:tp};var v=vault();v.unshift(n);saveVault(v);addRecap(t,'permanent-note',tp);return n;}
    if(/^\/\/\s/.test(t)){var c=t.replace(/^\/\/\s*/,'');console.log('[Matey] silent:',c);addRecap(c,'silent-auto','system');return{type:'silent',content:c,created:now};}
    if(/^\?\?\s/.test(t)){var q=t.replace(/^\?\?\s*/,'');return{type:'kb-query',content:q,results:searchKB(q),created:now};}
    if(/^!!\s/.test(t)){var i={type:'priority',content:t.replace(/^!!\s*/,''),created:now};var p=priorities();p.unshift(i);savePriorities(p.slice(0,20));addRecap(t,'priority-flag','priority');return i;}
    return null;
  }
  function searchKB(query) {
    if(!query)return[];var l=query.toLowerCase(),hits=[];
    vault().forEach(function(n){if(n.content&&n.content.toLowerCase().indexOf(l)!==-1)hits.push({source:'permanent-note',text:n.content,topic:n.topic,created:n.created});});
    sessions().forEach(function(n){if(n.content&&n.content.toLowerCase().indexOf(l)!==-1)hits.push({source:'scratchpad',text:n.content,created:n.created});});
    try{var md=localStorage.getItem('matey-markdown')||'';if(md.toLowerCase().indexOf(l)!==-1)hits.push({source:'markdown',text:md.substring(0,300)});}catch(e){}
    try{var pf=localStorage.getItem('matey-profile')||'';if(pf.toLowerCase().indexOf(l)!==-1)hits.push({source:'profile',text:pf.substring(0,300)});}catch(e){}
    return hits.slice(0,10);
  }
  function polish(text) {
    if(!text)return'';
    return text.replace(/\b(um|uh|er|ah|like|you know|i mean|sort of|kind of)\b/gi,'').replace(/\s{2,}/g,' ').replace(/([.!?])\s*([a-z])/g,function(_,p,c){return p+' '+c.toUpperCase();}).replace(/^\s*[a-z]/,function(m){return m.toUpperCase();}).replace(/\s{2,}/g,' ').trim();
  }
  function extractTasks(text) {
    if(!text)return[];var tasks=[],re=/[-*]\s*\[([ x])\]\s*(.+)/gi,m;
    while((m=re.exec(text))!==null)tasks.push({done:m[1]==='x',text:m[2].trim()});
    return tasks;
  }
  function getAllNotes() {
    return {permanent:vault(),scratchpads:sessions(),priorities:priorities(),recap:(function(){try{return JSON.parse(localStorage.getItem(RECAP_KEY)||'[]');}catch(e){return[];}})()};
  }
  window.MateySyntax={parse:parse,search:searchKB,polish:polish,extractTasks:extractTasks,getAllNotes:getAllNotes,vault:vault,sessions:sessions,priorities:priorities};
})();