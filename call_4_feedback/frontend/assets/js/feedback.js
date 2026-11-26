import { api, escapeHtml as e, icons, toast } from './api.js';

let contacts = [], choices = {}, selectedId, filter = 'all', search = '', group = 'all';
let pending = {}, timer, saving = Promise.resolve(), mounted = false, inFlight = 0;
const contact = () => contacts.find(item => item.id === selectedId);
const initials = name => name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
const groupOf = item => /^[A-E]/i.exec(item.code)?.[0].toUpperCase() || 'other';
const status = item => item.result === 'Opened Seen on the call' || item.openedSeen === 'Yes' ? 'Opened Seen' : item.result || item.reached || (item.calledOn ? 'Called' : 'Not called');
const filtered = () => contacts.filter(item => {
  const match = `${item.name} ${item.phone} ${item.code} ${item.partner}`.toLowerCase().includes(search.toLowerCase());
  return match && (group === 'all' || groupOf(item) === group) && (filter === 'all' || (filter === 'uncalled' && !item.calledOn) || (filter === 'called' && item.calledOn) || (filter === 'followup' && ['Promised', 'Call again'].includes(item.result)));
});
function timeLabel(value) {
  if (!value) return 'Not called yet';
  if (/^\d{2}:\d{2}$/.test(value)) return `${value} · time from sheet`;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}
function feedbackStatus(text, isError = false) {
  const element = document.querySelector('#save-status');
  if (element) { element.textContent = text; element.classList.toggle('save-error', isError); }
}
function replaceContact(updated) { contacts = contacts.map(item => item.id === updated.id ? updated : item); }

export async function flush() {
  clearTimeout(timer);
  const run = saving.catch(() => {}).then(async () => {
    if (!Object.keys(pending).length) return;
    const item = contact(); if (!item) return;
    const patch = { ...pending }; pending = {};
    inFlight++;
    feedbackStatus('Saving…');
    try {
      const { contact: updated } = await api(`/contacts/${item.id}`, { method: 'PATCH', body: JSON.stringify({ patch, revision: item.revision }) });
      replaceContact(updated);
      feedbackStatus(Object.keys(pending).length ? 'Unsaved changes' : 'All changes saved');
      renderStats(); renderQueue();
    } catch (error) {
      pending = { ...patch, ...pending };
      feedbackStatus(error.status === 409 ? 'Changed elsewhere · reload required' : 'Not saved · try again', true);
      toast(error.message, true);
      throw error;
    } finally { inFlight--; }
  });
  saving = run;
  return run;
}
function queueSave(key, value) {
  pending[key] = value;
  feedbackStatus('Unsaved changes');
  clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 650);
}
function renderStats() {
  if (!mounted) return;
  const counts = [contacts.length, contacts.filter(item => item.calledOn).length, contacts.filter(item => item.reached === 'Yes').length, contacts.filter(item => !item.calledOn).length];
  document.querySelectorAll('[data-stat]').forEach((node, index) => { node.textContent = counts[index]; });
  const attempted = contacts.length ? Math.round(counts[1] / contacts.length * 100) : 0;
  document.querySelector('#progress-label').textContent = `${attempted}% of your list called`;
  document.querySelector('#call-progress').value = attempted;
}
function renderQueue() {
  if (!mounted) return;
  const list = filtered();
  document.querySelector('#queue-count').textContent = `${list.length} ${list.length === 1 ? 'person' : 'people'}`;
  document.querySelector('#contact-list').innerHTML = list.length ? list.map(item => `<button class="contact-row ${item.id === selectedId ? 'selected' : ''}" data-contact="${item.id}" aria-current="${item.id === selectedId ? 'true' : 'false'}"><span class="avatar group-${e(groupOf(item))}">${e(initials(item.name))}</span><span class="contact-copy"><strong>${e(item.name)}</strong><span>${e(item.code)} <span aria-hidden="true">·</span> ${e(item.partner || 'Contact')}</span></span><span class="queue-status ${item.calledOn ? 'attempted' : ''}" aria-label="${item.calledOn ? 'Called' : 'Not called'}">${item.calledOn ? icons.check : '<span></span>'}</span></button>`).join('') : '<div class="empty-queue">No matches here.<br><span>Try another search or filter.</span></div>';
}
function selectOptions(key, current) {
  const list = [...choices[key]];
  if (current && !list.includes(current)) list.push(current);
  return `<option value="">Choose…</option>${list.map(value => `<option ${value === current ? 'selected' : ''} value="${e(value)}">${e(value)}</option>`).join('')}`;
}
function renderDetail() {
  const item = contact() ? { ...contact(), ...pending } : null;
  const panel = document.querySelector('#contact-detail');
  if (!item) { panel.innerHTML = `<div class="empty-state"><span class="empty-art" aria-hidden="true">${icons.phone}</span><span class="eyebrow">LET’S GET STARTED</span><h2>Your next conversation starts here.</h2><p>Your starting contacts will appear here when the initial data is loaded.</p></div>`; return; }
  const showContext = !/^[CD]\s*\d+$/i.test(item.code);
  panel.innerHTML = `<div class="detail-heading"><div class="person-title"><span class="avatar large group-${e(groupOf(item))}">${e(initials(item.name))}</span><div><div class="person-meta"><span class="code-tag group-${e(groupOf(item))}">${e(item.code)}</span><span>${e(item.partner)}${item.listNo ? ` · List ${e(item.listNo)}` : ''}</span></div><h2>${e(item.name)}</h2></div></div><span class="status-pill">${e(status(item))}</span></div>
    <div class="call-strip"><div><span class="eyebrow">MAKE THE CONNECTION</span><button id="call-button" class="call-button" ${!item.phone ? 'disabled' : ''}>${icons.phone}<span>${e(item.phone || 'No number on file')}</span><span class="call-label">Call</span></button></div><div class="last-call"><span>Last called</span><strong id="called-on">${e(timeLabel(item.calledOn))}</strong><small>Time saved when you click Call</small></div></div>
    ${showContext && item.context ? `<div class="context-note"><span class="context-icon" aria-hidden="true">i</span><div><strong>Where they are & what to do</strong><p>${e(item.context)}</p></div></div>` : ''}
    <form id="feedback-form"><div class="form-heading"><h3>The conversation</h3><span id="save-status" role="status">All changes saved</span></div>
    <div class="form-grid"><label>Reached<select name="reached">${selectOptions('reached', item.reached)}</select></label><label>Result<select name="result">${selectOptions('result', item.result)}</select></label><label>Why they had not started<select name="reason">${selectOptions('reason', item.reason)}</select></label><label>Promised for<input name="promisedFor" value="${e(item.promisedFor)}" placeholder="A date, time or their own words" maxlength="1000"></label><label class="span-two">Notes<textarea name="notes" rows="3" placeholder="What did they say? Capture the useful details…" maxlength="10000">${e(item.notes)}</textarea></label><label class="opened-field">Opened Seen <span class="label-muted">(Seen fills)</span><select name="openedSeen">${selectOptions('openedSeen', item.openedSeen)}</select></label><div class="contact-extras">${item.whatsapp ? `<span>WhatsApp <strong>${e(item.whatsapp)}</strong></span>` : ''}<span>${item.attempts ? `${item.attempts} ${item.attempts === 1 ? 'call' : 'calls'} logged in Forseen` : 'Your updates save automatically'}</span></div></div>
    <div class="form-footer"><button class="button secondary" id="save-button" type="submit">${icons.check}Save feedback</button><button class="button primary" id="next-button" type="button">Save & next person</button></div></form>`;
  panel.querySelector('#feedback-form').addEventListener('input', event => { if (event.target.name) queueSave(event.target.name, event.target.value); });
  panel.querySelector('#feedback-form').addEventListener('submit', async event => { event.preventDefault(); try { await flush(); toast('Feedback saved.'); } catch {} });
  panel.querySelector('#next-button').addEventListener('click', async () => {
    try {
      await flush();
      const list = filtered(), index = list.findIndex(candidate => candidate.id === selectedId);
      const next = list[index + 1] || list.find(candidate => !candidate.calledOn && candidate.id !== selectedId);
      if (!next) return toast('You’ve reached the end of this list.');
      await selectContact(next.id);
    } catch {}
  });
  panel.querySelector('#call-button').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try {
      await flush();
      const current = contact();
      const { contact: updated } = await api(`/contacts/${current.id}/call`, { method: 'POST', body: JSON.stringify({ revision: current.revision }) });
      replaceContact(updated); renderDetail(); renderQueue(); renderStats();
      window.location.href = 'tel:' + updated.phone.replace(/[^\d+]/g, '');
      toast('Call time saved. Opening your dialer.');
    } catch (error) { toast(error.message, true); button.disabled = false; }
  });
}
async function selectContact(id) {
  await flush(); selectedId = id;
  try { localStorage.setItem('forseen-contact', String(id)); } catch {}
  renderQueue(); renderDetail();
  if (window.matchMedia('(max-width: 760px)').matches) { document.querySelector('#queue-panel').classList.remove('expanded'); document.querySelector('#queue-toggle').setAttribute('aria-expanded', 'false'); document.querySelector('#queue-toggle').textContent = 'Browse list'; document.querySelector('#contact-detail').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

export async function mountFeedback(main) {
  mounted = false;
  const data = await api('/contacts'); contacts = data.contacts; choices = data.choices;
  let remembered; try { remembered = Number(localStorage.getItem('forseen-contact')); } catch {}
  selectedId = contacts.find(item => item.id === selectedId || item.id === remembered)?.id || contacts.find(item => !item.calledOn)?.id || contacts[0]?.id;
  filter = 'all'; search = ''; group = 'all';
  main.innerHTML = `<section class="page-heading"><div><span class="eyebrow">A GOOD CONVERSATION GOES A LONG WAY</span><h1>Feedback calls<span class="title-dot">.</span></h1><p>A name, a call, a little insight. Keep it all together.</p></div><div class="page-actions"><button class="button secondary" id="export-button">${icons.download}Download CSV</button></div></section>
    <section class="stats" aria-label="Call progress"><div class="stat stat-lilac"><span>Total people</span><strong data-stat>0</strong><span class="stat-art art-grid" aria-hidden="true"></span></div><div class="stat stat-peach"><span>Called so far</span><strong data-stat>0</strong><span class="stat-art art-rings" aria-hidden="true"></span></div><div class="stat stat-green"><span>People reached</span><strong data-stat>0</strong><span class="stat-art art-flower" aria-hidden="true">✳</span></div><div class="stat stat-yellow"><span>Still to call</span><strong data-stat>0</strong><span class="stat-art art-sun" aria-hidden="true"></span></div></section>
    <section class="workbench" aria-label="Feedback call workspace"><aside class="queue-panel" id="queue-panel"><div class="queue-heading"><div><h2>Your call list</h2><span id="queue-count">0 people</span></div><button id="queue-toggle" class="text-button" aria-expanded="false" aria-controls="queue-content">Browse list</button></div><div id="queue-content"><label class="search-field">${icons.search}<input id="search" type="search" placeholder="Search a name, code or number" aria-label="Search contacts"></label><div class="queue-filters"><label class="sr-only" for="status-filter">Call status</label><select id="status-filter"><option value="all">All people</option><option value="uncalled">Not called</option><option value="called">Called</option><option value="followup">Follow up</option></select><label class="sr-only" for="group-filter">Code group</label><select id="group-filter"><option value="all">All codes</option>${[...new Set(contacts.map(groupOf))].sort().map(code => `<option value="${e(code)}">Group ${e(code)}</option>`).join('')}</select></div><div class="contact-list" id="contact-list"></div></div><div class="queue-progress"><span id="progress-label">0% of your list called</span><progress id="call-progress" max="100" value="0">0%</progress></div></aside><article class="contact-detail" id="contact-detail" aria-label="Selected contact"></article></section>`;
  mounted = true; renderStats(); renderQueue(); renderDetail();
  main.querySelector('#search').addEventListener('input', event => { search = event.target.value; renderQueue(); });
  main.querySelector('#status-filter').addEventListener('change', event => { filter = event.target.value; renderQueue(); });
  main.querySelector('#group-filter').addEventListener('change', event => { group = event.target.value; renderQueue(); });
  main.querySelector('#contact-list').addEventListener('click', event => { const button = event.target.closest('[data-contact]'); if (button) selectContact(Number(button.dataset.contact)).catch(() => {}); });
  main.querySelector('#queue-toggle').addEventListener('click', event => { const expanded = main.querySelector('#queue-panel').classList.toggle('expanded'); event.currentTarget.setAttribute('aria-expanded', String(expanded)); event.currentTarget.textContent = expanded ? 'Close list' : 'Browse list'; });
  main.querySelector('#export-button').addEventListener('click', async () => {
    try { await flush(); const response = await fetch('/api/v1/export'); if (!response.ok) throw new Error('Could not download the CSV. Please sign in and try again.'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `forseen-feedback-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); toast('Your feedback CSV is ready.'); } catch (error) { toast(error.message, true); }
  });
}
export function unmountFeedback() { mounted = false; }
export function hasUnsavedChanges() { return Object.keys(pending).length > 0 || inFlight > 0; }
