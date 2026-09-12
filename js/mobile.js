import{$}from'./ui.js';
const overlay=document.createElement('div');overlay.className='mobile-overlay';document.body.append(overlay);
overlay.addEventListener('click',()=>{$('#sidebar')?.classList.remove('open');document.body.classList.remove('menu-open')});
document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='menu')document.body.classList.toggle('menu-open',$('#sidebar')?.classList.contains('open'));if(e.target.closest('[data-page]'))document.body.classList.remove('menu-open')});
addEventListener('resize',()=>{if(innerWidth>900){$('#sidebar')?.classList.remove('open');document.body.classList.remove('menu-open')}});
