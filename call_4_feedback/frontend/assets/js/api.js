export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch('/api/v1' + path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  } catch { throw new Error('Connection lost. Your edits are still here. Try saving again.'); }
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== '/session') document.dispatchEvent(new Event('session-expired'));
    const error = new Error(data.error || 'Could not complete that action.');
    error.status = response.status;
    throw error;
  }
  return data;
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function toast(message, error = false) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, error ? 10000 : 4500);
}
export const icons = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m7 3 3 5-2 2c1.3 2.7 3.3 4.7 6 6l2-2 5 3-1 4C10 22 2 14 3 4Z" stroke-linejoin="round"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
