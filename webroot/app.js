'use strict';
/* FORGE // GIT - Full GitHub client WebUI */
const MOD = '/data/adb/modules/forge_git';
const CLI = `sh ${MOD}/forge.sh`;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HAS_KSU = typeof window.ksu !== 'undefined' && typeof window.ksu.exec === 'function';

/* ---- shell ---- */
let cbn = 0;
function exec(cmd) {
  return new Promise(resolve => {
    if (!HAS_KSU) return resolve({ errno: 1, stdout: '', stderr: 'no root manager' });
    const n = `__forge_${Date.now()}_${cbn++}`;
    window[n] = (errno, stdout, stderr) => { delete window[n]; resolve({ errno, stdout: stdout || '', stderr: stderr || '' }); };
    try { window.ksu.exec(cmd, '{}', n); } catch (e) { delete window[n]; resolve({ errno: 1, stdout: '', stderr: String(e) }); }
  });
}
const cli = a => exec(`${CLI} ${a}`);
async function cliJSON(a, fb) {
  const r = await cli(a); try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return fb; }
}
const q = s => `'${String(s).replace(/'/g, '')}'`;
const b64 = s => btoa(unescape(encodeURIComponent(s)));

/* ---- GitHub API via shell ---- */
async function gh(method, endpoint, body) {
  const bd = body ? b64(typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const r = await cli(`api ${q(method)} ${q(endpoint)}${bd ? ' ' + q(bd) : ''}`);
  try { return JSON.parse(r.stdout); } catch (e) { return { error: r.stdout || r.stderr || 'parse error' }; }
}
const ghGet = ep => gh('GET', ep);
const ghPost = (ep, d) => gh('POST', ep, d);
const ghPut = (ep, d) => gh('PUT', ep, d);
const ghPatch = (ep, d) => gh('PATCH', ep, d);
const ghDel = ep => gh('DELETE', ep);

/* ---- state ---- */
const S = { user: null, tab: 'repos', repos: [], repo: '', path: '', actRepo: '', pushRepo: '', pushPath: '', relRepo: '' };

/* ---- ui ---- */
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
function openSheet(h, bind) { $('#sheet').innerHTML = h; $('#sheetBg').classList.add('on'); $('#sheet').scrollTop = 0; if (bind) bind($('#sheet')); }
function closeSheet() { $('#sheetBg').classList.remove('on'); }
$('#sheetBg').addEventListener('click', e => { if (e.target.id === 'sheetBg') closeSheet(); });

function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s) || s < 0) return '';
  if (s < 60) return 'just now'; if (s < 3600) return `${s / 60 | 0}m ago`; if (s < 86400) return `${s / 3600 | 0}h ago`;
  if (s < 86400 * 60) return `${s / 86400 | 0}d ago`; return new Date(iso).toLocaleDateString();
}

/* ---- nav ---- */
$$('nav.bottom button').forEach(b => b.onclick = () => {
  S.tab = b.dataset.t;
  $$('nav.bottom button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => t.classList.toggle('on', t.id === 't-' + S.tab));
  loadTab();
});
function loadTab() {
  if (S.tab === 'repos') loadRepos();
  else if (S.tab === 'actions') loadActions();
  else if (S.tab === 'releases') loadReleases();
  else if (S.tab === 'push') loadPush();
  else if (S.tab === 'settings') loadSettings();
}

/* ============= REPOS TAB ============= */
async function loadRepos() {
  const box = $('#t-repos');
  if (!S.user) { box.innerHTML = '<div class="empty">Set your token in Settings first.</div>'; return; }
  if (S.repo) return loadTree();
  box.innerHTML = '<div class="empty"><span class="spin"></span> Loading repos</div>';
  const repos = await ghGet(`/users/${S.user.login}/repos?per_page=100&sort=pushed`);
  if (repos.error || !Array.isArray(repos)) { box.innerHTML = `<div class="empty">${esc(repos.error || repos.message || 'Error')}</div>`; return; }
  S.repos = repos;
  const search = `<div class="search"><svg viewBox="0 0 24 24"><path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"/></svg><input id="repoQ" placeholder="Search repos" autocomplete="off"></div>`;
  box.innerHTML = search + '<div id="repoList"></div>';
  const render = () => {
    const q = ($('#repoQ').value || '').toLowerCase();
    const list = repos.filter(r => !q || r.full_name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q));
    $('#repoList').innerHTML = list.length ? list.map(r => `<div class="card" data-repo="${esc(r.full_name)}"><div class="row"><h3>${esc(r.name)}</h3><span class="spacer"></span>${r.private ? '<span class="chip y">private</span>' : '<span class="chip g">public</span>'}${r.fork ? '<span class="chip">fork</span>' : ''}</div><p>${esc(r.description || '')}</p><div class="meta">${esc(r.language || '')} · ★ ${r.stargazers_count} · ${ago(r.pushed_at)}</div></div>`).join('') : '<div class="empty">No repos.</div>';
  };
  render();
  $('#repoQ').addEventListener('input', render);
  box.addEventListener('click', e => { const c = e.target.closest('[data-repo]'); if (c) { S.repo = c.dataset.repo; S.path = ''; loadTree(); } });
}

async function loadTree() {
  const box = $('#t-repos');
  const parts = S.path ? S.path.split('/') : [];
  let bc = `<a href="#" data-nav="">📂 ${esc(S.repo.split('/')[1])}</a>`;
  parts.forEach((p, i) => { bc += ` / <a href="#" data-nav="${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</a>`; });
  box.innerHTML = `<div class="toolbar"><button class="ghost" id="backBtn">← Back</button><span class="spacer"></span><button class="ghost" id="newFileBtn">+ New file</button></div><div class="breadcrumb">${bc}</div><div id="treeBox"><div class="empty"><span class="spin"></span></div></div>`;
  $('#backBtn').onclick = () => { if (S.path) { S.path = S.path.split('/').slice(0, -1).join('/'); loadTree(); } else { S.repo = ''; loadRepos(); } };
  $('#newFileBtn').onclick = () => openEditor(S.repo, S.path ? S.path + '/new-file.txt' : 'new-file.txt', '', null);
  box.querySelectorAll('[data-nav]').forEach(a => a.onclick = e => { e.preventDefault(); S.path = a.dataset.nav; loadTree(); });

  const ep = `/repos/${S.repo}/contents/${S.path}`;
  const data = await ghGet(ep);
  if (data.error || data.message) { $('#treeBox').innerHTML = `<div class="empty">${esc(data.message || data.error)}</div>`; return; }

  if (Array.isArray(data)) {
    const dirs = data.filter(f => f.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
    const files = data.filter(f => f.type !== 'dir').sort((a, b) => a.name.localeCompare(b.name));
    $('#treeBox').innerHTML = `<div class="file-tree">${dirs.map(f => `<a class="dir" href="#" data-path="${esc(f.path)}">📁 ${esc(f.name)}/</a>`).join('')}${files.map(f => `<a href="#" data-path="${esc(f.path)}" data-sha="${esc(f.sha)}" data-size="${f.size}">📄 ${esc(f.name)} <span style="color:var(--mu);float:right">${f.size > 1024 ? (f.size / 1024).toFixed(1) + ' KB' : f.size + ' B'}</span></a>`).join('')}</div>`;
    $('#treeBox').addEventListener('click', e => {
      e.preventDefault(); const a = e.target.closest('[data-path]'); if (!a) return;
      if (a.classList.contains('dir')) { S.path = a.dataset.path; loadTree(); }
      else openFile(S.repo, a.dataset.path, a.dataset.sha);
    });
  } else if (data.content) {
    showFileContent(data);
  }
}

async function openFile(repo, path, sha) {
  openSheet(`<div class="empty"><span class="spin"></span> Loading ${esc(path)}</div>`);
  const data = await ghGet(`/repos/${repo}/contents/${path}`);
  if (data.error || !data.content) { openSheet(`<h2>${esc(path)}</h2><div class="empty">${esc(data.message || 'Could not load')}</div>`); return; }
  showFileContent(data, repo);
}
function showFileContent(data, repo) {
  repo = repo || S.repo;
  let content; try { content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))); } catch (e) { content = '[binary file]'; }
  const isImg = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(data.name);
  const body = isImg ? `<img src="data:image/*;base64,${data.content.replace(/\n/g, '')}" style="max-width:100%;border-radius:8px">` : `<pre class="log">${esc(content)}</pre>`;
  openSheet(`<h2>${esc(data.name)}</h2><div class="meta" style="margin-bottom:10px">${esc(data.path)} · ${data.size > 1024 ? (data.size / 1024).toFixed(1) + ' KB' : data.size + ' B'} · sha ${esc((data.sha || '').slice(0, 12))}</div>${body}<div class="toolbar" style="margin-top:12px"><button class="ghost" id="editBtn">Edit</button><button class="ghost" id="copyBtn">Copy</button><button class="danger" id="delBtn">Delete</button></div>`, s => {
    $('#editBtn', s).onclick = () => { closeSheet(); openEditor(repo, data.path, content, data.sha); };
    $('#copyBtn', s).onclick = () => { navigator.clipboard.writeText(content).then(() => toast('Copied')); };
    $('#delBtn', s).onclick = async () => {
      if (!confirm('Delete ' + data.name + '?')) return;
      const r = await ghDel(`/repos/${repo}/contents/${data.path}`, JSON.stringify({ message: 'Delete ' + data.name, sha: data.sha }));
      closeSheet(); toast(r.commit ? 'Deleted' : 'Error'); loadTree();
    };
  });
}

function openEditor(repo, path, content, sha) {
  openSheet(`<h2>${sha ? 'Edit' : 'Create'} file</h2><div class="toolbar"><span class="hint" style="margin:0">in ${esc(repo)}</span></div><input class="f" id="edPath" value="${esc(path)}" placeholder="path/to/file.txt" style="margin-bottom:8px"><textarea class="f" id="edContent" style="min-height:40vh">${esc(content)}</textarea><input class="f" id="edMsg" placeholder="Commit message" value="${sha ? 'Update ' : 'Create '}${esc(path.split('/').pop())}" style="margin-top:8px"><div class="toolbar" style="margin-top:10px"><button class="primary" id="edSave" style="flex:1">${sha ? 'Commit' : 'Create'}</button><button class="ghost" id="edCancel">Cancel</button></div>`, s => {
    $('#edCancel', s).onclick = closeSheet;
    $('#edSave', s).onclick = async () => {
      const p = $('#edPath', s).value.trim(), c = $('#edContent', s).value, m = $('#edMsg', s).value.trim();
      if (!p || !m) return toast('Path and message required');
      $('#edSave', s).disabled = true; $('#edSave', s).innerHTML = '<span class="spin"></span>';
      const body = { message: m, content: b64(c) };
      if (sha) body.sha = sha;
      const r = await ghPut(`/repos/${repo}/contents/${p}`, body);
      closeSheet();
      if (r.content) { toast('Committed!'); S.path = p.split('/').slice(0, -1).join('/'); loadTree(); }
      else toast(r.message || 'Error');
    };
  });
}

/* ============= ACTIONS TAB ============= */
async function loadActions() {
  const box = $('#t-actions');
  if (!S.user) { box.innerHTML = '<div class="empty">Set your token in Settings first.</div>'; return; }
  if (!S.actRepo) {
    box.innerHTML = '<h4 style="margin:0 0 10px">Select a repo for Actions</h4>' + (S.repos.length ? S.repos.map(r => `<div class="card" data-ar="${esc(r.full_name)}"><h3>${esc(r.name)}</h3><p>${esc(r.description || '')}</p></div>`).join('') : '<div class="empty">Load repos first.</div>');
    box.addEventListener('click', e => { const c = e.target.closest('[data-ar]'); if (c) { S.actRepo = c.dataset.ar; loadActions(); } }, { once: true });
    return;
  }
  box.innerHTML = `<div class="toolbar"><button class="ghost" id="actBack">← Repos</button><span class="spacer"></span><span style="font-weight:700">${esc(S.actRepo.split('/')[1])}</span></div><div id="wfBox"><div class="empty"><span class="spin"></span> Loading workflows</div></div>`;
  $('#actBack').onclick = () => { S.actRepo = ''; loadActions(); };

  const wf = await ghGet(`/repos/${S.actRepo}/actions/workflows?per_page=30`);
  const runs = await ghGet(`/repos/${S.actRepo}/actions/runs?per_page=30`);
  if (!wf.workflows) { $('#wfBox').innerHTML = `<div class="empty">${esc(wf.message || 'No workflows')}</div>`; return; }

  const statusDot = s => `<span class="dot ${s}"></span>`;
  const statusChip = s => { const c = { success: 'g', failure: 'r', in_progress: 'y', queued: '', cancelled: 'r' }; return `<span class="chip ${c[s] || ''}">${esc(s)}</span>`; };

  let html = '';
  for (const w of wf.workflows) {
    const wRuns = (runs.workflow_runs || []).filter(r => r.workflow_id === w.id);
    html += `<div class="card"><div class="row"><h3>${esc(w.name)}</h3><span class="spacer"></span><button class="ghost" data-dispatch="${w.id}" data-wname="${esc(w.name)}">▶ Run</button></div>`;
    if (wRuns.length) {
      html += wRuns.slice(0, 8).map(r => `<div class="row" style="margin-top:6px;cursor:pointer" data-run="${r.id}"><span class="run-status">${statusDot(r.status === 'completed' ? r.conclusion : r.status)} ${esc(r.head_commit ? r.head_commit.message.split('\n')[0].slice(0, 50) : r.display_title || '#' + r.run_number)}</span><span class="spacer"></span><span class="meta">${ago(r.created_at)}</span>${statusChip(r.conclusion || r.status)}</div>`).join('');
    } else html += '<div class="meta" style="margin-top:4px">No runs yet</div>';
    html += '</div>';
  }
  $('#wfBox').innerHTML = html || '<div class="empty">No workflows found.</div>';

  // dispatch
  $('#wfBox').addEventListener('click', async e => {
    const d = e.target.closest('[data-dispatch]');
    if (d) {
      e.stopPropagation();
      const wName = d.dataset.wname;
      const branches = await ghGet(`/repos/${S.actRepo}/branches?per_page=10`);
      const def = Array.isArray(branches) && branches.length ? (branches.find(b => b.name === 'main') || branches[0]).name : 'main';
      openSheet(`<h2>Run ${esc(wName)}</h2><p class="hint">Branch:</p><input class="f" id="dispBranch" value="${esc(def)}"><div class="toolbar" style="margin-top:12px"><button class="primary" id="dispGo" style="flex:1">Run workflow</button><button class="ghost" id="dispNo">Cancel</button></div>`, s => {
        $('#dispNo', s).onclick = closeSheet;
        $('#dispGo', s).onclick = async () => {
          const br = $('#dispBranch', s).value.trim();
          $('#dispGo', s).disabled = true; $('#dispGo', s).innerHTML = '<span class="spin"></span>';
          const r = await ghPost(`/repos/${S.actRepo}/actions/workflows/${d.dataset.dispatch}/dispatches`, { ref: br });
          closeSheet();
          if (r && !r.message) { toast('Workflow triggered!'); setTimeout(loadActions, 3000); }
          else toast(r.message || 'Error');
        };
      });
      return;
    }
    const run = e.target.closest('[data-run]');
    if (run) openRun(run.dataset.run);
  });
}

async function openRun(runId) {
  openSheet(`<div class="empty"><span class="spin"></span> Loading run</div>`);
  const run = await ghGet(`/repos/${S.actRepo}/actions/runs/${runId}`);
  const jobs = await ghGet(`/repos/${S.actRepo}/actions/runs/${runId}/jobs`);
  if (!run.id) { openSheet(`<div class="empty">${esc(run.message || 'Error')}</div>`); return; }

  const statusDot = s => `<span class="dot ${s}"></span>`;
  let jhtml = '';
  if (jobs.jobs) {
    for (const j of jobs.jobs) {
      jhtml += `<div class="card" style="margin-top:8px"><div class="row">${statusDot(j.status === 'completed' ? j.conclusion : j.status)} <strong>${esc(j.name)}</strong> <span class="spacer"></span><span class="chip">${esc(j.conclusion || j.status)}</span></div>`;
      if (j.steps) jhtml += j.steps.map(s => `<div class="meta" style="margin-left:18px">${s.conclusion === 'success' ? '✅' : s.conclusion === 'failure' ? '❌' : '⏳'} ${esc(s.name)}</div>`).join('');
      jhtml += `<button class="ghost" style="margin-top:6px" data-joblog="${j.id}">View log</button></div>`;
    }
  }

  openSheet(`<h2>${esc(run.display_title || run.name)}</h2><div class="meta">#${run.run_number} · ${esc(run.head_branch)} · ${ago(run.created_at)}</div><div class="row" style="margin-top:8px">${statusDot(run.status === 'completed' ? run.conclusion : run.status)} <span class="chip ${run.conclusion === 'success' ? 'g' : run.conclusion === 'failure' ? 'r' : ''}">${esc(run.conclusion || run.status)}</span><span class="spacer"></span>${run.status !== 'completed' ? `<button class="danger" id="cancelRun">Cancel</button>` : `<button class="ghost" id="rerunBtn">Re-run</button>`}</div>${jhtml}<div class="toolbar" style="margin-top:12px"><button class="ghost" id="openRunWeb">Open in browser</button></div>`, s => {
    const cr = $('#cancelRun', s); if (cr) cr.onclick = async () => { await ghPost(`/repos/${S.actRepo}/actions/runs/${runId}/cancel`); closeSheet(); toast('Cancelled'); setTimeout(loadActions, 2000); };
    const rr = $('#rerunBtn', s); if (rr) rr.onclick = async () => { await ghPost(`/repos/${S.actRepo}/actions/runs/${runId}/rerun`); closeSheet(); toast('Re-run started'); setTimeout(loadActions, 3000); };
    const ow = $('#openRunWeb', s); if (ow) ow.onclick = () => cli(`open ${q(run.html_url)}`);
    $$('[data-joblog]', s).forEach(b => b.onclick = () => loadJobLog(b.dataset.joblog));
  });
}

async function loadJobLog(jobId) {
  openSheet(`<div class="empty"><span class="spin"></span> Loading log</div>`);
  const r = await cli(`api GET '/repos/${S.actRepo}/actions/jobs/${jobId}/logs'`);
  const log = r.stdout || 'Could not load log. GitHub may redirect to a download URL.';
  openSheet(`<h2>Job log</h2><pre class="log">${esc(log.slice(-30000))}</pre><button class="ghost" style="margin-top:8px" onclick="navigator.clipboard.writeText(document.querySelector('.log').textContent).then(()=>document.getElementById('toast').textContent='Copied',document.getElementById('toast').classList.add('on'))">Copy</button>`);
}

/* ============= RELEASES TAB ============= */
async function loadReleases() {
  const box = $('#t-releases');
  if (!S.user) { box.innerHTML = '<div class="empty">Set your token in Settings first.</div>'; return; }
  if (!S.relRepo) {
    box.innerHTML = '<h4 style="margin:0 0 10px">Select a repo for Releases</h4>' + (S.repos.length ? S.repos.map(r => `<div class="card" data-rr="${esc(r.full_name)}"><h3>${esc(r.name)}</h3></div>`).join('') : '<div class="empty">Load repos first.</div>');
    box.addEventListener('click', e => { const c = e.target.closest('[data-rr]'); if (c) { S.relRepo = c.dataset.rr; loadReleases(); } }, { once: true });
    return;
  }
  box.innerHTML = `<div class="toolbar"><button class="ghost" id="relBack">← Repos</button><span class="spacer"></span><span style="font-weight:700">${esc(S.relRepo.split('/')[1])}</span><span class="spacer"></span><button class="ghost" id="newRel">+ New release</button></div><div id="relList"><div class="empty"><span class="spin"></span></div></div>`;
  $('#relBack').onclick = () => { S.relRepo = ''; loadReleases(); };
  $('#newRel').onclick = () => createRelease();

  const rels = await ghGet(`/repos/${S.relRepo}/releases?per_page=30`);
  if (!Array.isArray(rels)) { $('#relList').innerHTML = `<div class="empty">${esc(rels.message || 'Error')}</div>`; return; }
  if (!rels.length) { $('#relList').innerHTML = '<div class="empty">No releases yet.</div>'; return; }

  $('#relList').innerHTML = rels.map(r => `<div class="card"><div class="row"><h3>${esc(r.name || r.tag_name)}</h3><span class="spacer"></span>${r.prerelease ? '<span class="chip y">pre-release</span>' : '<span class="chip g">latest</span>'}${r.draft ? '<span class="chip">draft</span>' : ''}</div><div class="meta">${esc(r.tag_name)} · ${ago(r.published_at || r.created_at)}${r.author ? ' · ' + esc(r.author.login) : ''}</div>${r.assets && r.assets.length ? '<div style="margin-top:8px">' + r.assets.map(a => `<div class="row" style="margin:4px 0"><span style="font:12px var(--mono)">${esc(a.name)}</span><span class="spacer"></span><span class="meta">${a.size > 1048576 ? (a.size / 1048576).toFixed(1) + ' MB' : (a.size / 1024).toFixed(0) + ' KB'} · ${a.download_count} downloads</span><button class="ghost" style="padding:4px 10px;font-size:12px" data-dlurl="${esc(a.browser_download_url)}" data-dlname="${esc(a.name)}">Save</button></div>`).join('') + '</div>' : '<div class="meta" style="margin-top:4px">No assets</div>'}<div class="toolbar" style="margin-top:8px"><button class="ghost" data-editrel="${r.id}">Edit</button><button class="ghost" data-openrel="${esc(r.html_url)}">Open</button><button class="danger" data-delrel="${r.id}" data-delname="${esc(r.name || r.tag_name)}" style="padding:6px 12px;font-size:12px">Delete</button></div></div>`).join('');

  $('#relList').addEventListener('click', async e => {
    const dl = e.target.closest('[data-dlurl]');
    if (dl) { const r = await cliJSON(`dl ${q(dl.dataset.dlurl)} ${q(dl.dataset.dlname)}`, {}); toast(r.ok ? 'Saved to /data/adb/forge/cache/' + dl.dataset.dlname : 'Download failed'); return; }
    const op = e.target.closest('[data-openrel]');
    if (op) { cli(`open ${q(op.dataset.openrel)}`); return; }
    const del = e.target.closest('[data-delrel]');
    if (del) { if (!confirm('Delete release ' + del.dataset.delname + '?')) return; await ghDel(`/repos/${S.relRepo}/releases/${del.dataset.delrel}`); toast('Deleted'); loadReleases(); return; }
    const ed = e.target.closest('[data-editrel]');
    if (ed) editRelease(ed.dataset.editrel);
  });
}

function createRelease() {
  openSheet(`<h2>New release</h2><p class="hint">in ${esc(S.relRepo)}</p><input class="f" id="nrTag" placeholder="Tag (e.g. v1.0.0)" style="margin-bottom:8px"><input class="f" id="nrTitle" placeholder="Title" style="margin-bottom:8px"><textarea class="f" id="nrBody" placeholder="Release notes (markdown)"></textarea><div class="row" style="margin-top:8px"><label><input type="checkbox" id="nrPre"> Pre-release</label><label><input type="checkbox" id="nrDraft"> Draft</label></div><div class="toolbar" style="margin-top:12px"><button class="primary" id="nrGo" style="flex:1">Create</button><button class="ghost" id="nrNo">Cancel</button></div>`, s => {
    $('#nrNo', s).onclick = closeSheet;
    $('#nrGo', s).onclick = async () => {
      const tag = $('#nrTag', s).value.trim(), title = $('#nrTitle', s).value.trim(), body = $('#nrBody', s).value;
      if (!tag) return toast('Tag required');
      $('#nrGo', s).disabled = true; $('#nrGo', s).innerHTML = '<span class="spin"></span>';
      const r = await ghPost(`/repos/${S.relRepo}/releases`, { tag_name: tag, name: title || tag, body, prerelease: $('#nrPre', s).checked, draft: $('#nrDraft', s).checked });
      closeSheet(); toast(r.id ? 'Created!' : r.message || 'Error'); loadReleases();
    };
  });
}

async function editRelease(id) {
  const r = await ghGet(`/repos/${S.relRepo}/releases/${id}`);
  if (!r.id) return toast('Could not load');
  openSheet(`<h2>Edit release</h2><input class="f" id="erTag" value="${esc(r.tag_name)}" style="margin-bottom:8px" disabled><input class="f" id="erTitle" value="${esc(r.name)}" style="margin-bottom:8px"><textarea class="f" id="erBody">${esc(r.body || '')}</textarea><div class="row" style="margin-top:8px"><label><input type="checkbox" id="erPre" ${r.prerelease ? 'checked' : ''}> Pre-release</label><label><input type="checkbox" id="erDraft" ${r.draft ? 'checked' : ''}> Draft</label></div><div class="toolbar" style="margin-top:12px"><button class="primary" id="erGo" style="flex:1">Save</button><button class="ghost" id="erNo">Cancel</button></div>`, s => {
    $('#erNo', s).onclick = closeSheet;
    $('#erGo', s).onclick = async () => {
      $('#erGo', s).disabled = true;
      const res = await ghPatch(`/repos/${S.relRepo}/releases/${id}`, { name: $('#erTitle', s).value, body: $('#erBody', s).value, prerelease: $('#erPre', s).checked, draft: $('#erDraft', s).checked });
      closeSheet(); toast(res.id ? 'Updated!' : res.message || 'Error'); loadReleases();
    };
  });
}

/* ============= PUSH TAB ============= */
async function loadPush() {
  const box = $('#t-push');
  if (!S.user) { box.innerHTML = '<div class="empty">Set your token in Settings first.</div>'; return; }
  box.innerHTML = `<h4 style="margin:0 0 10px">Quick push</h4>
    <p class="hint">Create or update a file in any repo with one commit.</p>
    <select class="f" id="pushRepoSel" style="margin-bottom:8px">${S.repos.map(r => `<option value="${esc(r.full_name)}" ${r.full_name === S.pushRepo ? 'selected' : ''}>${esc(r.full_name)}</option>`).join('')}</select>
    <input class="f" id="pushPath" placeholder="path/to/file.txt" value="${esc(S.pushPath)}" style="margin-bottom:8px">
    <button class="ghost" id="pushLoad" style="margin-bottom:8px">Load existing file</button>
    <textarea class="f" id="pushContent" placeholder="File content" style="min-height:30vh"></textarea>
    <input class="f" id="pushMsg" placeholder="Commit message" style="margin-top:8px">
    <input class="f" id="pushBranch" placeholder="Branch (default: main)" value="main" style="margin-top:8px">
    <div class="toolbar" style="margin-top:12px"><button class="primary" id="pushGo" style="flex:1">Push commit</button></div>
    <div id="pushResult"></div>`;

  $('#pushRepoSel').onchange = e => S.pushRepo = e.target.value;
  if (!S.pushRepo && S.repos.length) S.pushRepo = S.repos[0].full_name;

  $('#pushLoad').onclick = async () => {
    const repo = $('#pushRepoSel').value, path = $('#pushPath').value.trim();
    if (!path) return toast('Enter a file path first');
    const data = await ghGet(`/repos/${repo}/contents/${path}`);
    if (data.content) {
      try { $('#pushContent').value = decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))); } catch (e) { $('#pushContent').value = '[binary]'; }
      $('#pushContent').dataset.sha = data.sha;
      toast('Loaded, sha saved');
    } else toast(data.message || 'Not found');
  };

  $('#pushGo').onclick = async () => {
    const repo = $('#pushRepoSel').value, path = $('#pushPath').value.trim(), content = $('#pushContent').value, msg = $('#pushMsg').value.trim(), branch = $('#pushBranch').value.trim() || 'main';
    if (!path || !msg) return toast('Path and message required');
    $('#pushGo').disabled = true; $('#pushGo').innerHTML = '<span class="spin"></span>';
    const body = { message: msg, content: b64(content), branch };
    if ($('#pushContent').dataset.sha) body.sha = $('#pushContent').dataset.sha;
    const r = await ghPut(`/repos/${repo}/contents/${path}`, body);
    $('#pushGo').disabled = false; $('#pushGo').textContent = 'Push commit';
    if (r.content) { $('#pushResult').innerHTML = `<div class="card" style="margin-top:10px"><div class="chip g">Committed!</div><div class="meta" style="margin-top:4px">${esc(r.commit.sha.slice(0, 12))} · ${esc(r.commit.message)}</div></div>`; $('#pushContent').dataset.sha = r.content.sha; }
    else $('#pushResult').innerHTML = `<div class="card" style="margin-top:10px;border-color:var(--bad)"><div class="chip r">Error</div><div class="meta" style="margin-top:4px">${esc(r.message || 'Unknown error')}</div></div>`;
  };
}

/* ============= SETTINGS TAB ============= */
async function loadSettings() {
  const box = $('#t-settings');
  const has = await cliJSON('token_check', { has: false });
  const tools = await cliJSON('tools', {});
  box.innerHTML = `
    <div class="card"><h3>GitHub Token</h3><p class="hint" style="margin-top:4px">Personal access token with the scopes you need (repo, workflow, etc.). Stored in a root-only file (0600).</p>
      <input class="f" id="tokenIn" type="password" placeholder="${has.has ? '●●●●●●●● (saved)' : 'ghp_...'}" style="margin-top:8px">
      <div class="toolbar" style="margin-top:8px"><button class="primary" id="tokenSave">Save token</button><button class="danger" id="tokenClear" ${has.has ? '' : 'disabled'}>Remove</button></div>
      <div id="tokenStatus" class="meta" style="margin-top:4px">${has.has ? '✅ Token saved' : '⚠️ No token set'}</div></div>
    <div class="card"><h3>Account</h3><div id="acctInfo">${S.user ? `<div class="row"><img src="${esc(S.user.avatar_url)}" style="width:40px;height:40px;border-radius:50%"><div><strong>${esc(S.user.name || S.user.login)}</strong><div class="meta">${esc(S.user.login)} · ${S.user.public_repos} repos · ${S.user.followers} followers</div></div></div>` : '<div class="meta">Save a token to see your account.</div>'}</div></div>
    <div class="card"><h3>Diagnostics</h3><div class="meta">curl: ${tools.curl ? '✅' : '❌'}<br>API: ${tools.sdk ? 'SDK ' + esc(tools.sdk) : '?'} · ${esc(tools.abi || '?')} · ${esc(tools.device || '?')}</div></div>
    <div class="card"><h3>About</h3><div class="meta">FORGE // GIT v1.0.0<br>GitHub client for rooted Android.<br>Token is kept in /data/adb/forge/token (root, 0600).<br>All API calls go through curl in the root shell.</div></div>`;

  $('#tokenSave').onclick = async () => {
    const v = $('#tokenIn').value.trim();
    if (!v) return toast('Paste your token');
    await cliJSON(`token_set ${q(b64(v))}`, {});
    toast('Token saved');
    await initUser();
    loadSettings();
  };
  $('#tokenClear').onclick = async () => {
    await cliJSON('token_clear', {});
    S.user = null; $('#userChip').textContent = 'no token';
    toast('Token removed'); loadSettings();
  };
}

/* ---- init ---- */
async function initUser() {
  const has = await cliJSON('token_check', { has: false });
  if (!has.has) return;
  const u = await ghGet('/user');
  if (u.login) { S.user = u; $('#userChip').textContent = '@' + u.login; }
  // preload repos
  const repos = await ghGet(`/user/repos?per_page=100&sort=pushed&affiliation=owner`);
  if (Array.isArray(repos)) S.repos = repos;
}

async function boot() {
  await initUser();
  loadTab();
}
boot();
