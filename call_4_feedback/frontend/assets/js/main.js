import { api, escapeHtml as e, icons, toast } from './api.js';
import { apps } from './apps.js';
import { hasUnsavedChanges } from './feedback.js';

const main = document.querySelector('#main');
let activeApp, authenticated = false, navigation = Promise.resolve();
function workspace() {
  document.title = 'Your workspace · Forseen';
  main.innerHTML = `<section class="workspace-intro"><span class="eyebrow">YOUR PERSONAL TOOLKIT</span><h1>A little room<br>for <em>everything.</em></h1><p>One place for the things you need to get done.<br>Pick a tool and make a little progress.</p><div class="workspace-art" aria-hidden="true"><span></span><span></span><span></span></div></section><section class="app-cards" aria-label="Your tools">${apps.map(app => `<a class="app-card" href="#${app.id}"><span class="app-card-icon">${app.icon}</span><span class="eyebrow">READY WHEN YOU ARE</span><h2>${e(app.title)}</h2><p>${e(app.description)}</p><span class="open-app">Open app</span></a>`).join('')}<div class="future-card"><span class="future-symbol" aria-hidden="true">✳</span><h2>Space to grow.</h2><p>Your next useful idea belongs here. New tools can join this workspace as new tabs.</p></div></section>`;
}
async function route() {
  if (!authenticated) return;
  const id = location.hash.slice(1) || 'calls';
  const next = apps.find(app => app.id === id);
  try { await activeApp?.beforeLeave?.(); } catch { history.replaceState(null, '', '#' + activeApp.id); return; }
  activeApp?.unmount?.(); activeApp = undefined;
  document.querySelector('#app-nav').innerHTML = `${apps.map(app => `<a href="#${app.id}" class="app-tab ${id === app.id ? 'active' : ''}" ${id === app.id ? 'aria-current="page"' : ''}>${app.icon}${e(app.title)}</a>`).join('')}<a href="#workspace" class="app-tab workspace-tab ${!next ? 'active' : ''}" ${!next ? 'aria-current="page"' : ''}>${icons.grid}Workspace</a><span class="nav-caption">Small tools. Useful things.</span>`;
  if (!next) return workspace();
  main.innerHTML = '<p class="loading">Getting your call list…</p>';
  try { await next.mount(main); activeApp = next; document.title = `${next.title} · Forseen`; }
  catch (error) { main.innerHTML = `<div class="empty-state"><h1>Couldn’t open your call list.</h1><p>${e(error.message)}</p><button id="retry" class="button primary">Try again</button></div>`; main.querySelector('#retry').onclick = () => { navigation = navigation.then(route); }; }
}
function login() {
  authenticated = false;
  document.querySelector('#app-nav').innerHTML = '';
  document.querySelector('#logout').hidden = true;
  main.innerHTML = `<section class="login"><span class="eyebrow">YOUR PERSONAL WORKSPACE</span><h1>Welcome<br><em>to your space.</em></h1><p>Sign in to see your people and pick up where you left off.</p><form id="login-form"><label>Workspace password<input type="password" name="password" autocomplete="current-password" required autofocus></label><button class="button primary" type="submit">Open workspace</button><p id="login-error" role="alert"></p></form></section>`;
  main.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try { await api('/session', { method: 'POST', body: JSON.stringify({ password: event.currentTarget.password.value }) }); authenticated = true; document.querySelector('#logout').hidden = false; await route(); }
    catch (error) { document.querySelector('#login-error').textContent = error.message; button.disabled = false; }
  });
}
document.querySelector('#logout').addEventListener('click', async () => {
  try { await activeApp?.beforeLeave?.(); await api('/logout', { method: 'POST', body: '{}' }); activeApp?.unmount?.(); activeApp = undefined; login(); } catch (error) { toast(error.message, true); }
});
window.addEventListener('hashchange', () => { navigation = navigation.catch(() => {}).then(route); });
window.addEventListener('beforeunload', event => { if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('session-expired', () => toast('Your session ended. Save your notes before refreshing and signing in again.', true));
try { const session = await api('/session'); authenticated = session.authenticated; document.querySelector('#logout').hidden = !session.passwordRequired || !authenticated; if (authenticated) await route(); else login(); }
catch (error) { main.innerHTML = `<div class="empty-state"><h1>Your workspace is taking a moment.</h1><p>${e(error.message)}</p><p>Refresh to try again.</p></div>`; }
