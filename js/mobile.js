import{$}from'./ui.js';
import{settings}from'./storage.js';
$('#app')?.classList.toggle('collapsed',settings.get('sidebarCollapsed',false));
const overlay=document.createElement('div');overlay.className='mobile-overlay';document.body.append(overlay);
overlay.addEventListener('click',()=>{$('#sidebar')?.classList.remove('open');document.body.classList.remove('menu-open')});
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='menu')document.body.classList.toggle('menu-open',$('#sidebar')?.classList.contains('open'));if(action==='collapse')settings.set('sidebarCollapsed',$('#app')?.classList.contains('collapsed'));if(e.target.closest('[data-page]'))document.body.classList.remove('menu-open')});
addEventListener('resize',()=>{if(innerWidth>900){$('#sidebar')?.classList.remove('open');document.body.classList.remove('menu-open')}});
