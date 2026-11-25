/* MediBook frontend – vanilla JS. Only the public Apps Script Web App URL lives here (no secrets). */
const API_URL = 'https://script.google.com/macros/s/AKfycby6UqIZnZrOAstMVNO6ULzC_TGVBrr8BE6KYAk1WsWCupfXzHvCWV0tQp1RsCsLaaBI/exec';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&','<':'<','>':'>','"':'"',"'":'''}[c]));
const S = {token: sessionStorage.getItem('tk'), user: JSON.parse(sessionStorage.getItem('us') || 'null'), view: '', arg: null, doctors: {}};
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/* ---------- API / UI helpers ---------- */
let busy = 0;
const loading = n => { busy += n; $('#loader').hidden = busy <= 0; };
function toast(m, bad) { const d = document.createElement('div'); d.textContent = m; if (bad) d.className = 'bad'; $('#toast').append(d); setTimeout(() => d.remove(), 4000); }
async function api(action, data = {}) {
  if (API_URL.startsWith('PASTE')) throw new Error('Set API_URL in script.js to your Apps Script Web App URL');
  loading(1);
  try {
    // text/plain avoids a CORS preflight, which Apps Script cannot answer
    const r = await fetch(API_URL, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify({action, token: S.token, data})});
    const j = await r.json();
    if (!j.ok) { if (j.code === 401 && S.token) logout(); throw new Error(j.error); }
    return j.data;
  } catch (e) { throw e instanceof TypeError ? new Error('Network error – check API_URL / deployment access') : e; }
  finally { loading(-1); }
}
const badge = s => `<span class="badge b-${esc(String(s).split(' ')[0])}">${esc(s)}</span>`;
const table = (head, rows) => `<div class="tw"><table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.length ? rows.join('') : `<tr><td colspan="${head.length}" class="mut">No records found</td></tr>`}</table></div>`;
const btn = (act, label, attrs = '', cls = '') => `<button class="btn sm ${cls}" data-act="${act}" ${attrs}>${label}</button>`;
function fld(f, v = {}) {
  const val = v[f.name] ?? '', req = f.req ? 'required' : '';
  let input;
  if (f.type === 'select') input = `<select name="${f.name}" ${req}>${f.opts.map(o => { const [a, b] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(a)}" ${a == val ? 'selected' : ''}>${esc(b)}</option>`; }).join('')}</select>`;
  else if (f.type === 'textarea') input = `<textarea name="${f.name}" ${req}>${esc(val)}</textarea>`;
  else input = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}" ${req} ${f.attr || ''}>`;
  return `<label class="${f.full ? 'full' : ''}">${f.label}${input}</label>`;
}
function overlay(html) { const m = document.createElement('div'); m.className = 'overlay'; m.innerHTML = html; document.body.append(m); m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.remove(); }); return m; }
function modal(title, fields, vals, onSave, label = 'Save') {
  const m = overlay(`<form class="modal"><h3>${title}</h3><div class="grid">${fields.map(f => fld(f, vals)).join('')}</div><div class="row end"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn">${label}</button></div></form>`);
  m.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    try { await onSave(Object.fromEntries(new FormData(e.target))); m.remove(); toast('Saved successfully'); go(S.view, S.arg); } catch (x) { toast(x.message, 1); }
  };
}
const ask = msg => new Promise(r => { const m = overlay(`<div class="modal"><h3>Please confirm</h3><p>${esc(msg)}</p><div class="row end"><button class="btn ghost" data-close>No</button><button class="btn red" id="yes">Yes</button></div></div>`); m.querySelector('#yes').onclick = () => { m.remove(); r(true); }; m.addEventListener('remove', () => r(false)); });
async function run(p, ok = 'Done') { try { await p; toast(ok); go(S.view, S.arg); } catch (x) { toast(x.message, 1); } }

/* ---------- auth & navigation ---------- */
const NAV = {
  admin: [['dashboard', '📊 Dashboard'], ['doctors', '🩺 Doctors'], ['appointments', '📅 Appointments'], ['book', '➕ Book Appointment'], ['patients', '👥 Patient CRM'], ['reports', '📈 Reports']],
  doctor: [['dashboard', '📊 Dashboard'], ['appointments', '📅 My Appointments'], ['patients', '👥 My Patients']],
  patient: [['dashboard', '📊 Dashboard'], ['doctors', '🔍 Find Doctors'], ['book', '➕ Book Appointment'], ['appointments', '📅 My Appointments'], ['record', '📁 Medical Records']]
};
function start() {
  $('#auth').hidden = !!S.user; $('#guest').hidden = true; $('#app').hidden = !S.user; if (!S.user) { if (location.hash === '#book') showGuest(); return; }
  $('#who').textContent = `${S.user.name} (${S.user.role})`;
  $('#nav').innerHTML = NAV[S.user.role].map(n => `<a data-v="${n[0]}">${n[1]}</a>`).join('');
  go('dashboard');
}
function logout() { sessionStorage.clear(); S.token = null; S.user = null; start(); }
function go(v, a) {
  S.view = v; S.arg = a;
  document.querySelectorAll('#nav a').forEach(x => x.classList.toggle('on', x.dataset.v === v));
  $('#side').classList.remove('open');
  V[v](a).catch(x => { toast(x.message, 1); });
}
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $('#loginForm').hidden = b.dataset.tab !== 'login'; $('#regForm').hidden = b.dataset.tab !== 'register';
});
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try { const r = await api('login', Object.fromEntries(new FormData(e.target))); S.token = r.token; S.user = r.user; sessionStorage.setItem('tk', r.token); sessionStorage.setItem('us', JSON.stringify(r.user)); e.target.reset(); start(); } catch (x) { toast(x.message, 1); }
};
$('#regForm').onsubmit = async e => {
  e.preventDefault();
  try { await api('register', Object.fromEntries(new FormData(e.target))); toast('Account created – please log in'); e.target.reset(); document.querySelector('[data-tab=login]').click(); } catch (x) { toast(x.message, 1); }
};
$('#logout').onclick = logout; $('#burger').onclick = () => $('#side').classList.toggle('open');
$('#nav').onclick = e => { const a = e.target.closest('a'); if (a) go(a.dataset.v); };
$('#bell').onclick = async () => {
  try { const n = await api('notifications.list'); overlay(`<div class="modal"><h3>Notifications</h3>${n.map(x => `<p><b>${x.read === 'false' ? '● ' : ''}</b>${esc(x.message)}<br><small>${esc(x.createdAt.slice(0, 16).replace('T', ' '))}</small></p>`).join('') || '<p class="mut">Nothing yet</p>'}<div class="row end"><button class="btn" data-close>Close</button></div></div>`); api('notifications.read'); } catch (x) { toast(x.message, 1); }
};

/* ---------- public guest booking (no login) ---------- */
async function showGuest() {
  $('#auth').hidden = true; $('#guest').hidden = false;
  try {
    const docs = await api('public.doctors', {});
    if (!docs.length) { $('#guestBox').innerHTML = '<p class="mut">No doctors are available right now.</p>'; return; }
    $('#guestBox').innerHTML = `<form id="gf">${fld({name: 'doctorId', label: 'Doctor', type: 'select', opts: docs.map(d => [d.id, `${d.name} – ${d.specialization} (₹${d.fee})`]), req: 1})}
    ${fld({name: 'date', label: 'Date', type: 'date', req: 1, attr: `min="${todayStr()}"`})}<label>Available slots</label><div class="slots" id="gsl"><span class="mut">Select a date</span></div><input type="hidden" name="time">
    ${fld({name: 'name', label: 'Your name', req: 1})}${fld({name: 'phone', label: 'Phone', req: 1})}${fld({name: 'email', label: 'Email', type: 'email', req: 1})}${fld({name: 'reason', label: 'Reason for visit', type: 'textarea'})}
    <input name="website" style="display:none" tabindex="-1" autocomplete="off"><button class="btn block">Confirm booking</button></form>`;
    const f = $('#gf'), slots = async () => {
      f.time.value = ''; if (!f.date.value) return;
      const s = await api('public.slots', {doctorId: f.doctorId.value, date: f.date.value});
      $('#gsl').innerHTML = s.map(t => `<button type="button" class="slot" data-act="slot" data-t="${t}">${t}</button>`).join('') || '<span class="mut">No slots available that day</span>';
    };
    f.doctorId.onchange = f.date.onchange = () => slots().catch(x => toast(x.message, 1));
    f.onsubmit = async e => {
      e.preventDefault(); if (!f.time.value) return toast('Please choose a time slot', 1);
      try { const r = await api('public.book', Object.fromEntries(new FormData(f))); $('#guestBox').innerHTML = `<div class="panel"><h3 style="margin-top:0">✅ Appointment booked</h3><p>Reference: <b>${esc(r.id)}</b><br>${esc(r.date)} at ${esc(r.time)}</p><p class="mut">Please quote this reference at the clinic.</p></div>`; }
      catch (x) { toast(x.message, 1); slots().catch(() => {}); }
    };
  } catch (x) { toast(x.message, 1); }
}
$('#guestBtn').onclick = showGuest; $('#backLogin').onclick = () => { $('#guest').hidden = true; $('#auth').hidden = false; };

/* ---------- shared renderers ---------- */
const role = () => S.user.role, staff = () => role() !== 'patient';
function apptTable(list) {
  return table(['ID', 'Date', 'Time', 'Patient', 'Doctor', 'Reason', 'Status', 'Payment', ''], list.map(a => `<tr><td>${a.id}</td><td>${a.date}</td><td>${a.time}</td><td>${esc(a.patientName)}</td><td>${esc(a.doctorName)}<br><small>${esc(a.specialization)}</small></td><td class="wrap">${esc(a.reason)}</td><td>${badge(a.status)}</td><td>${badge(a.payment || '-')} ${a.amount ? '₹' + esc(a.amount) : ''}</td><td class="row">
    ${staff() ? btn('open', 'Record', `data-id="${a.patientId}"`, 'ghost') : ''}
    ${a.status === 'Scheduled' && role() !== 'patient' ? btn('astat', 'Complete', `data-id="${a.id}" data-s="Completed"`) + btn('astat', 'No-show', `data-id="${a.id}" data-s="No-Show"`, 'ghost') : ''}
    ${a.status === 'Scheduled' ? btn('astat', 'Cancel', `data-id="${a.id}" data-s="Cancelled"`, 'red') : ''}
    ${role() === 'admin' && a.payment === 'Pending' ? btn('pay', 'Mark paid', `data-id="${a.paymentId}"`, 'ghost') : ''}</td></tr>`));
}
const fuTable = list => table(['Due', 'Patient', 'Note', 'Status', ''], list.map(f => `<tr><td class="${f.overdue || (f.status === 'Pending' && f.dueDate < todayStr()) ? 'over' : ''}">${f.dueDate}</td><td>${esc(f.patientName || '')}</td><td class="wrap">${esc(f.note)}</td><td>${badge(f.status)}</td><td>${staff() && f.status === 'Pending' ? btn('fu', 'Mark done', `data-id="${f.id}"`) : ''}</td></tr>`));

/* ---------- views ---------- */
const V = {};
V.dashboard = async () => {
  const d = await api('dashboard');
  $('#view').innerHTML = `<h2>Welcome, ${esc(S.user.name)}</h2><div class="cards">${d.cards.map(c => `<div class="card"><span>${c[0]}</span><b>${esc(c[1])}</b></div>`).join('')}</div>
  <h3>Upcoming appointments</h3>${apptTable(d.upcoming)}<h3>Follow-up reminders</h3>${fuTable(d.followups)}
  <h3>Recent notifications</h3><div class="panel">${d.notifications.slice(0, 5).map(n => `<p>${esc(n.message)} <small>${esc(n.createdAt.slice(0, 10))}</small></p>`).join('') || '<span class="mut">No notifications</span>'}</div>`;
};
V.doctors = async () => {
  $('#view').innerHTML = `<div class="row between"><h2>Doctors</h2>${role() === 'admin' ? btn('docAdd', '+ Add doctor') : ''}</div>
  <div class="filters"><input id="dq" placeholder="Search name, specialty…"><input id="ds" placeholder="Specialization filter"></div><div id="dl" class="dgrid"></div>`;
  let t; const load = async () => {
    const l = await api('doctors.list', {q: $('#dq').value, specialization: $('#ds').value.trim()}); S.doctors = {}; l.forEach(x => S.doctors[x.id] = x);
    $('#dl').innerHTML = l.map(x => `<div class="dcard"><h3 style="margin:0">${esc(x.name)}</h3><div class="mut">${esc(x.specialization)} · ${esc(x.experience || 0)} yrs</div><p>₹${esc(x.fee)} · ${esc(x.availableDays)}<br>${esc(x.startTime)}–${esc(x.endTime)} ${role() === 'admin' ? badge(x.status) : ''}</p>
    <div class="row">${btn('docView', 'Profile', `data-id="${x.id}"`, 'ghost')}${role() !== 'doctor' && x.status === 'Active' ? btn('bookDoc', 'Book', `data-id="${x.id}"`) : ''}${role() === 'admin' ? btn('docEdit', 'Edit', `data-id="${x.id}"`, 'ghost') + (x.status === 'Active' ? btn('docOff', 'Deactivate', `data-id="${x.id}"`, 'red') : '') : ''}</div></div>`).join('') || '<p class="mut">No doctors found</p>';
  };
  [$('#dq'), $('#ds')].forEach(i => i.oninput = () => { clearTimeout(t); t = setTimeout(() => load().catch(x => toast(x.message, 1)), 350); });
  await load();
};
const docFields = (create) => [{name: 'name', label: 'Name', req: 1}, ...(create ? [{name: 'email', label: 'Login email', type: 'email', req: 1}, {name: 'password', label: 'Temporary password', type: 'password', req: 1}] : []),
  {name: 'specialization', label: 'Specialization', req: 1}, {name: 'experience', label: 'Experience (years)', type: 'number'}, {name: 'fee', label: 'Fee (₹)', type: 'number', req: 1}, {name: 'phone', label: 'Phone'},
  {name: 'availableDays', label: 'Days (Mon,Tue,…)'}, {name: 'startTime', label: 'Start', type: 'time'}, {name: 'endTime', label: 'End', type: 'time'}, ...(create ? [] : [{name: 'status', label: 'Status', type: 'select', opts: ['Active', 'Inactive']}]), {name: 'bio', label: 'Bio', type: 'textarea', full: 1}];
V.book = async pre => {
  const docs = await api('doctors.list', {}), pats = role() === 'admin' ? await api('patients.list', {status: ''}) : [];
  $('#view').innerHTML = `<h2>Book an appointment</h2><form class="panel" id="bf" style="max-width:640px">
  ${role() === 'admin' ? fld({name: 'patientId', label: 'Patient', type: 'select', opts: pats.map(p => [p.id, `${p.name} (${p.id})`]), req: 1}) : ''}
  ${fld({name: 'doctorId', label: 'Doctor', type: 'select', opts: docs.map(d => [d.id, `${d.name} – ${d.specialization} (₹${d.fee})`]), req: 1}, {doctorId: pre})}
  ${fld({name: 'date', label: 'Date', type: 'date', req: 1, attr: `min="${todayStr()}"`})}
  <label>Available slots</label><div class="slots" id="sl"><span class="mut">Select doctor and date</span></div><input type="hidden" name="time">
  ${fld({name: 'reason', label: 'Reason for visit', type: 'textarea'})}<button class="btn block">Confirm booking</button></form>`;
  const f = $('#bf'), loadSlots = async () => {
    f.time.value = ''; if (!f.date.value) return;
    const s = await api('slots', {doctorId: f.doctorId.value, date: f.date.value});
    $('#sl').innerHTML = s.map(t => `<button type="button" class="slot" data-act="slot" data-t="${t}">${t}</button>`).join('') || '<span class="mut">No slots available that day</span>';
  };
  f.doctorId.onchange = f.date.onchange = () => loadSlots().catch(x => toast(x.message, 1));
  f.onsubmit = async e => { e.preventDefault(); if (!f.time.value) return toast('Please choose a time slot', 1); try { await api('appointments.book', Object.fromEntries(new FormData(f))); toast('Appointment booked!'); go('appointments'); } catch (x) { toast(x.message, 1); loadSlots(); } };
};
V.appointments = async () => {
  $('#view').innerHTML = `<h2>Appointments</h2><div class="filters"><select id="fs"><option value="">All statuses</option>${['Scheduled', 'Completed', 'Cancelled', 'No-Show'].map(s => `<option>${s}</option>`).join('')}</select><input id="fd" type="date"></div><div id="al"></div>`;
  const load = async () => { $('#al').innerHTML = apptTable(await api('appointments.list', {status: $('#fs').value, date: $('#fd').value})); };
  $('#fs').onchange = $('#fd').onchange = () => load().catch(x => toast(x.message, 1)); await load();
};
V.patients = async () => {
  $('#view').innerHTML = `<div class="row between"><h2>Patient CRM</h2>${role() === 'admin' ? btn('patAdd', '+ Add patient') : ''}</div>
  <div class="filters"><input id="pq" placeholder="Search ID, name, phone, email"><select id="ps"><option value="">All statuses</option>${['Active', 'Under Treatment', 'Follow-up Required', 'Discharged', 'Inactive'].map(s => `<option>${s}</option>`).join('')}</select>
  <select id="pk"><option value="name">Sort: Name</option><option value="createdAt">Sort: Registered</option><option value="status">Sort: Status</option></select><select id="pd"><option value="asc">Ascending</option><option value="desc">Descending</option></select></div><div id="pl"></div>`;
  let t; const load = async () => {
    const l = await api('patients.list', {q: $('#pq').value, status: $('#ps').value, sort: $('#pk').value, dir: $('#pd').value});
    $('#pl').innerHTML = table(['ID', 'Name', 'Phone', 'Gender', 'Status', 'Last visit', 'Next follow-up', ''], l.map(p => `<tr><td>${p.id}</td><td>${esc(p.name)}</td><td>${esc(p.phone)}</td><td>${esc(p.gender)}</td><td>${badge(p.status)}</td><td>${p.lastVisit || '-'}</td><td>${p.nextFollowUp || '-'}</td><td>${btn('open', 'Open CRM', `data-id="${p.id}"`)}</td></tr>`));
  };
  ['pq', 'ps', 'pk', 'pd'].forEach(i => $('#' + i).oninput = () => { clearTimeout(t); t = setTimeout(() => load().catch(x => toast(x.message, 1)), 300); }); await load();
};
V.record = () => V.patient();
const patFields = [{name: 'name', label: 'Name', req: 1}, {name: 'phone', label: 'Phone', req: 1}, {name: 'dob', label: 'Date of birth', type: 'date'}, {name: 'gender', label: 'Gender', type: 'select', opts: ['', 'Male', 'Female', 'Other']},
  {name: 'bloodGroup', label: 'Blood group'}, {name: 'emergencyContact', label: 'Emergency contact'}, {name: 'address', label: 'Address', full: 1}, {name: 'allergies', label: 'Allergies', type: 'textarea', full: 1}, {name: 'conditions', label: 'Medical conditions', type: 'textarea', full: 1}];
V.patient = async id => {
  const p = await api('patients.get', {id}), P = p.patient; S.pat = p; const own = role() === 'patient';
  $('#view').innerHTML = `<div class="row between"><h2>${esc(P.name)} <small>${P.id}</small> ${badge(P.status)}</h2><div class="row">
    ${role() !== 'doctor' ? btn('patEdit', 'Edit profile') : btn('patEdit', 'Edit allergies/conditions')}${role() === 'admin' ? btn('patStat', 'Change status', '', 'ghost') : ''}
    ${staff() ? btn('hist', '+ Note / history', '', 'ghost') + btn('rx', '+ Prescription', '', 'ghost') + btn('fuAdd', '+ Follow-up', '', 'ghost') : ''}</div></div>
  <div class="grid2"><div class="panel"><h3 style="margin-top:0">Personal & contact</h3><p>Email: ${esc(P.email)}<br>Phone: ${esc(P.phone)}<br>DOB: ${esc(P.dob || '-')} · ${esc(P.gender || '-')} · Blood: ${esc(P.bloodGroup || '-')}<br>Address: ${esc(P.address || '-')}<br>Emergency: ${esc(P.emergencyContact || '-')}</p></div>
  <div class="panel"><h3 style="margin-top:0">Allergies & conditions</h3><p><b>Allergies:</b> ${esc(P.allergies || 'None recorded')}</p><p><b>Conditions:</b> ${esc(P.conditions || 'None recorded')}</p></div></div>
  <h3>Appointments</h3>${table(['ID', 'Date', 'Time', 'Doctor', 'Reason', 'Status'], p.appointments.map(a => `<tr><td>${a.id}</td><td>${a.date}</td><td>${a.time}</td><td>${esc(a.doctorName)}</td><td class="wrap">${esc(a.reason)}</td><td>${badge(a.status)}</td></tr>`))}
  <h3>Medical history & consultation notes</h3>${table(['Date', 'Type', 'Title', 'Details', 'Doctor'], p.history.map(h => `<tr><td>${h.createdAt.slice(0, 10)}</td><td>${esc(h.type)}</td><td>${esc(h.title)}</td><td class="wrap">${esc(h.details)}</td><td>${esc(h.doctorName)}</td></tr>`))}
  <h3>Prescriptions</h3>${table(['Date', 'Medicine', 'Dosage', 'Duration', 'Instructions', 'Doctor'], p.prescriptions.map(r => `<tr><td>${r.createdAt.slice(0, 10)}</td><td>${esc(r.medicine)}</td><td>${esc(r.dosage)}</td><td>${esc(r.duration)}</td><td class="wrap">${esc(r.instructions)}</td><td>${esc(r.doctorName)}</td></tr>`))}
  <h3>Follow-ups</h3>${fuTable(p.followups.map(f => ({...f, patientName: P.name})))}
  <h3>Activity timeline</h3><div class="panel"><div class="tl">${p.timeline.map(t => `<div><b>${esc(t.title)}</b> <span class="badge">${esc(t.type)}</span><br><small>${esc(String(t.date).slice(0, 16).replace('T', ' '))}</small> ${esc(t.detail)}</div>`).join('') || '<span class="mut">No activity yet</span>'}</div></div>`;
};
V.reports = async () => {
  const r = await api('reports'), bars = o => { const m = Math.max(1, ...Object.values(o)); return Object.entries(o).sort().map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${v / m * 60}%"></i><b>${v}</b></div>`).join('') || '<span class="mut">No data</span>'; };
  $('#view').innerHTML = `<h2>Reports & analytics</h2><div class="cards"><div class="card"><span>Revenue collected</span><b>₹${r.revenue.paid}</b></div><div class="card"><span>Revenue pending</span><b>₹${r.revenue.pending}</b></div></div>
  <div class="grid2" style="margin-top:14px"><div class="panel"><h3 style="margin-top:0">Appointments by status</h3>${bars(r.byStatus)}</div><div class="panel"><h3 style="margin-top:0">Appointments by doctor</h3>${bars(r.byDoctor)}</div>
  <div class="panel"><h3 style="margin-top:0">Appointments by month</h3>${bars(r.byMonth)}</div><div class="panel"><h3 style="margin-top:0">Patients by status</h3>${bars(r.patientsByStatus)}</div></div>`;
};

/* ---------- actions (event delegation) ---------- */
const aptOpts = () => [['', '— none —'], ...S.pat.appointments.map(a => [a.id, `${a.id} · ${a.date}`])];
const ACT = {
  open: d => go('patient', d.id), bookDoc: d => go('book', d.id), slot: (d, el) => { document.querySelectorAll('.slot').forEach(x => x.classList.toggle('on', x === el)); el.closest('form').time.value = d.t; },
  docView: d => { const x = S.doctors[d.id]; overlay(`<div class="modal"><h3>${esc(x.name)}</h3><p><b>${esc(x.specialization)}</b> · ${esc(x.experience || 0)} years experience</p><p>${esc(x.bio || '')}</p><p>Fee: ₹${esc(x.fee)}<br>Days: ${esc(x.availableDays)}<br>Hours: ${esc(x.startTime)}–${esc(x.endTime)}<br>Contact: ${esc(x.phone || '-')}</p><div class="row end"><button class="btn ghost" data-close>Close</button></div></div>`); },
  docAdd: () => modal('Add doctor', docFields(1), {fee: 500, startTime: '09:00', endTime: '17:00', availableDays: 'Mon,Tue,Wed,Thu,Fri'}, v => api('doctors.save', v)),
  docEdit: d => modal('Edit doctor', docFields(0), S.doctors[d.id], v => api('doctors.save', {...v, id: d.id})),
  docOff: async d => { if (await ask('Deactivate this doctor? They will no longer be able to log in or be booked.')) run(api('doctors.deactivate', {id: d.id}), 'Doctor deactivated'); },
  astat: async d => { if (await ask(`Mark appointment ${d.id} as ${d.s}?`)) run(api('appointments.status', {id: d.id, status: d.s}), 'Appointment updated'); },
  pay: async d => { if (await ask('Mark this payment as paid?')) run(api('payments.update', {id: d.id, status: 'Paid', method: 'Cash'}), 'Payment recorded'); },
  fu: d => run(api('followups.status', {id: d.id, status: 'Done'}), 'Follow-up completed'),
  patAdd: () => modal('Add patient', [{name: 'email', label: 'Login email', type: 'email', req: 1}, {name: 'password', label: 'Temporary password', type: 'password', req: 1}, ...patFields], {}, v => api('patients.save', v)),
  patEdit: () => modal('Edit patient', role() === 'doctor' ? patFields.slice(-2) : patFields, S.pat.patient, v => api('patients.save', {...v, id: S.pat.patient.id})),
  patStat: () => modal('Patient status', [{name: 'status', label: 'Status', type: 'select', opts: ['Active', 'Under Treatment', 'Follow-up Required', 'Discharged', 'Inactive']}], S.pat.patient, v => api('patients.status', {...v, id: S.pat.patient.id})),
  hist: () => modal('Add note / history', [{name: 'type', label: 'Type', type: 'select', opts: ['Consultation Note', 'Medical Condition', 'Surgery', 'Vaccination', 'Lab Report', 'Other']}, {name: 'appointmentId', label: 'Appointment', type: 'select', opts: aptOpts()}, {name: 'title', label: 'Title', req: 1, full: 1}, {name: 'details', label: 'Details', type: 'textarea', full: 1}], {}, v => api('history.add', {...v, patientId: S.pat.patient.id})),
  rx: () => modal('Add prescription', [{name: 'medicine', label: 'Medicine', req: 1}, {name: 'dosage', label: 'Dosage', req: 1}, {name: 'duration', label: 'Duration', req: 1}, {name: 'appointmentId', label: 'Appointment', type: 'select', opts: aptOpts()}, {name: 'instructions', label: 'Instructions', type: 'textarea', full: 1}], {}, v => api('prescriptions.add', {...v, patientId: S.pat.patient.id})),
  fuAdd: () => modal('Schedule follow-up', [{name: 'dueDate', label: 'Due date', type: 'date', req: 1, attr: `min="${todayStr()}"`}, {name: 'note', label: 'Note', type: 'textarea', req: 1, full: 1}], {}, v => api('followups.add', {...v, patientId: S.pat.patient.id}))
};
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && ACT[b.dataset.act]) ACT[b.dataset.act](b.dataset, b); });
start();
