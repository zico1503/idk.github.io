(() => {
  'use strict';
  const chat=document.querySelector('#chat-view');
  if(!chat)return;
  const $=s=>document.querySelector(s), stateKey='atlas-community-workspace-v1', bgKey='atlas-community-background-v1';
  const labels={channels:'Channels',servers:'Servers',settings:'Settings'};
  let state={open:['channels','servers','settings'],active:'channels'};
  try{state={...state,...JSON.parse(localStorage.getItem(stateKey)||'{}')}}catch{}
  const validViews=['channels','servers','settings'];state.open=(Array.isArray(state.open)?state.open:[]).filter(x=>validViews.includes(x));
  if(!state.open.length)state.open=['channels'];
  if(!state.open.includes(state.active))state.active=state.open[0];
  const tabs=document.createElement('div');tabs.className='workspace-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Community views');
  const area=document.createElement('div');area.className='workspace-area';
  const panels={};
  ['channel-rail','chat-main','people-rail'].forEach(cls=>{});
  const channelPanel=document.createElement('section');channelPanel.id='channels-panel';channelPanel.className='workspace-panel channels-panel';channelPanel.setAttribute('role','tabpanel');
  for(const cls of ['channel-rail','chat-main','people-rail']){const node=chat.querySelector(`.${cls}`);if(node)channelPanel.append(node)}
  panels.channels=channelPanel;
  const servers=document.createElement('section');servers.id='servers-panel';servers.className='workspace-panel directory-panel';servers.setAttribute('role','tabpanel');servers.innerHTML='<div class="workspace-heading"><div><p class="workspace-kicker">YOUR COMMUNITIES</p><h2>Servers</h2><p>Choose a space, or make a new one with your friends.</p></div><div class="directory-actions"><button type="button" data-server-action="create">＋ Create server</button><button type="button" data-server-action="join">↗ Join with invite</button></div></div><div class="server-directory" id="server-directory"><div class="directory-empty">Loading your servers…</div></div>';
  panels.servers=servers;
  const settings=document.createElement('section');settings.id='settings-panel';settings.className='workspace-panel settings-panel';settings.setAttribute('role','tabpanel');settings.innerHTML='<div class="workspace-heading"><div><p class="workspace-kicker">YOUR CHAT, YOUR SPACE</p><h2>Settings</h2><p>These appearance choices are saved in this browser only.</p></div></div><section class="preference-card"><h3>Chat background</h3><p>Choose a subtle tint behind the conversation. It does not change what other members see.</p><div class="background-presets" role="group" aria-label="Background color presets"><button type="button" data-color="#15262d">Deep harbor</button><button type="button" data-color="#20273a">Indigo dusk</button><button type="button" data-color="#28352e">Moss room</button><button type="button" data-color="#382b2d">Warm ember</button></div><label class="custom-color">Pick a color <input id="workspace-color" type="color" value="#15262d"></label><button id="reset-background" type="button" class="reset-background">Reset background</button><p class="setting-note">Colors stay on this device in your browser. No image is uploaded.</p></section>';
  panels.settings=settings;
  area.append(channelPanel,servers,settings);
  const controls=document.createElement('div');controls.className='workspace-tab-actions';controls.innerHTML='<label class="sr-only" for="open-view">Open a view</label><select id="open-view" aria-label="Reopen a closed view"><option value="">＋ Open view</option><option value="channels">Channels</option><option value="servers">Servers</option><option value="settings">Settings</option></select>';
  chat.prepend(area);chat.prepend(tabs);chat.append(controls);
  function persist(){try{localStorage.setItem(stateKey,JSON.stringify(state))}catch{}}
  function renderTabs(){tabs.replaceChildren();for(const name of state.open){const item=document.createElement('div');item.className=`workspace-tab-wrap${name===state.active?' active':''}`;const tab=document.createElement('button');tab.type='button';tab.className='workspace-tab';tab.id=`tab-${name}`;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panels[name].id);tab.setAttribute('aria-selected',String(name===state.active));tab.tabIndex=name===state.active?0:-1;tab.textContent=labels[name];tab.onclick=()=>activate(name);const close=document.createElement('button');close.type='button';close.className='tab-close';close.setAttribute('aria-label',`Close ${labels[name]} view`);close.textContent='×';close.onclick=()=>closeTab(name);item.append(tab,close);tabs.append(item)}Object.entries(panels).forEach(([name,panel])=>{const open=state.open.includes(name);panel.hidden=!open||state.active!==name;panel.setAttribute('aria-labelledby',`tab-${name}`)});const choose=$('#open-view');[...choose.options].forEach(o=>{if(o.value)o.disabled=state.open.includes(o.value)});choose.value='';persist()}
  function activate(name){if(!state.open.includes(name))state.open.push(name);state.active=name;renderTabs();if(name==='servers')renderServers();}
  function closeTab(name){state.open=state.open.filter(x=>x!==name);if(!state.open.length){state.open=['channels'];state.active='channels'}else if(state.active===name)state.active=state.open[Math.max(0,state.open.length-1)];renderTabs();requestAnimationFrame(()=>document.querySelector(`#tab-${state.active}`)?.focus())}
  tabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...tabs.querySelectorAll('[role=tab]')];const i=buttons.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus()});
  $('#open-view').addEventListener('change',e=>{if(e.target.value)activate(e.target.value)});
  document.querySelector('[data-server-action="create"]').onclick=()=>$('#create-server')?.click();
  document.querySelector('[data-server-action="join"]').onclick=()=>$('#join-server')?.click();
  const select=$('#server-select'),list=$('#server-directory');
  function renderServers(){if(!select||!list)return;list.replaceChildren();const opts=[...select.options].filter(o=>o.value);if(!opts.length){const blank=document.createElement('div');blank.className='directory-empty';blank.innerHTML='<span>✳</span><h3>No servers here yet</h3><p>Create a server or join with an invite from a friend.</p>';list.append(blank);return}for(const opt of opts){const card=document.createElement('button');card.type='button';card.className='server-tile';card.innerHTML=`<span class="server-tile-mark">${(opt.textContent.trim()[0]||'✳').toUpperCase()}</span><span class="server-tile-copy"><b></b><small>OPEN COMMUNITY</small></span><span aria-hidden="true">↗</span>`;card.querySelector('b').textContent=opt.textContent;card.onclick=()=>{select.value=opt.value;select.dispatchEvent(new Event('change',{bubbles:true}));activate('channels')};list.append(card)}}
  if(select){new MutationObserver(renderServers).observe(select,{childList:true,subtree:true,characterData:true});renderServers()}
  const root=document.documentElement,colorInput=$('#workspace-color');
  const colorRe=/^#[0-9a-f]{6}$/i;
  function setBackground(color,save=true){if(!colorRe.test(color))return;root.style.setProperty('--workspace-bg',color);colorInput.value=color;document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color.toLowerCase()===color.toLowerCase())));if(save)try{localStorage.setItem(bgKey,color)}catch{}}
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>setBackground(b.dataset.color));colorInput.oninput=()=>setBackground(colorInput.value);$('#reset-background').onclick=()=>{try{localStorage.removeItem(bgKey)}catch{}setBackground('#15262d',false)};try{const saved=localStorage.getItem(bgKey);if(saved)setBackground(saved,false)}catch{}
  if(document.fonts?.ready)document.fonts.ready.then(()=>{if(state.active==='servers')renderServers()});renderTabs();
})();
