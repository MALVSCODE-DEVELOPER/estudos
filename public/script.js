// ============================================
// CONFIGURAÇÃO
// ============================================
const API_URL = '';
let estudos = [];
let editandoId = null;
let dadosParaRevisao = null;

// Comparação segura de IDs (evita bug número vs string vindo do servidor)
function sameId(a, b) {
  return String(a) === String(b);
}

// ============================================
// INICIALIZAÇÃO
// ============================================
async function inicializarApp() {
  await carregarDoServidor();
  if (estudos.length === 0) carregarDados();
  preencherFiltrosDashboard();
  atualizarDashboard();
  renderizarRegistros();
  renderizarRevisoes();
  window.addEventListener('beforeunload', () => salvarDados());
}

// ============================================
// PERSISTÊNCIA LOCAL
// ============================================
function carregarDados() {
  const dados = localStorage.getItem('estudosData');
  if (dados) {
    try {
      estudos = JSON.parse(dados);
      estudos = estudos.map(e => ({
        ...e,
        quantidade: e.quantidade || 0,
        erros: e.erros || 0,
        concluido: e.concluido || false,
        codigo: e.codigo || null,
        // BUG CORRIGIDO: cache local usa "dataEstudo" (camelCase),
        // só o servidor manda "data_estudo". Antes isso zerava a data.
        dataEstudo: e.dataEstudo || e.data_estudo || null,
        conteudo: e.conteudo || '',
        desempenho: calcularDesempenho(e)
      }));
      let maxCod = 0;
      estudos.forEach(e => { if (e.codigo && e.codigo > maxCod) maxCod = e.codigo; });
      estudos.forEach(e => { if (!e.codigo) { maxCod++; e.codigo = maxCod; } });
    } catch { estudos = []; }
  } else { estudos = []; }
}

function salvarDados() {
  localStorage.setItem('estudosData', JSON.stringify(estudos));
}

// ============================================
// BACKEND
// ============================================
async function carregarDoServidor() {
  try {
    const resp = await fetch('/api/estudos', { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('Erro');
    const data = await resp.json();
    if (data && Array.isArray(data)) {
      estudos = data.map(e => ({
        ...e,
        dataEstudo: e.data_estudo || e.dataEstudo || null,
        conteudo: e.conteudo || '',
        desempenho: calcularDesempenho(e)
      }));
      salvarDados();
      return true;
    }
    return false;
  } catch { return false; }
}

async function salvarNoServidor(estudo) {
  try {
    const method = estudo.id ? 'PUT' : 'POST';
    const url = estudo.id ? `/api/estudos/${estudo.id}` : '/api/estudos';
    const resp = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        curso: estudo.curso,
        unidade: estudo.unidade || '',
        conteudo: estudo.conteudo || '',
        data_estudo: estudo.dataEstudo || null,
        quantidade: estudo.quantidade || 0,
        erros: estudo.erros || 0,
        desempenho: estudo.desempenho !== undefined ? estudo.desempenho : null,
        concluido: estudo.concluido || false
      })
    });
    if (!resp.ok) throw new Error('Erro');
    return await resp.json();
  } catch (error) {
    console.error('Erro servidor:', error);
    mostrarToast('Erro ao sincronizar com o servidor.', 'error');
    return null;
  }
}

async function deletarNoServidor(id) {
  try {
    await fetch(`/api/estudos/${id}`, { method: 'DELETE' });
    return true;
  } catch { return false; }
}

// ============================================
// CÁLCULO DE DESEMPENHO
// ============================================
function calcularDesempenho(estudo) {
  const q = parseInt(estudo.quantidade) || 0;
  const e = parseInt(estudo.erros) || 0;
  if (q === 0) return null;
  return Math.round(((q - e) / q) * 100);
}

// ============================================
// NAVEGAÇÃO (sidebar)
// ============================================
function switchModule(modulo) {
  document.querySelectorAll('.module').forEach(el => el.classList.remove('active'));
  document.getElementById(`module-${modulo}`).classList.add('active');
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.sidebar-item[data-modulo="${modulo}"]`).classList.add('active');
  if (modulo === 'dashboard') atualizarDashboard();
  if (modulo === 'registros') renderizarRegistros();
  if (modulo === 'revisoes') renderizarRevisoes();
}

// ============================================
// DASHBOARD (top 5 melhores / piores, com filtro curso+unidade)
// ============================================
function preencherFiltrosDashboard() {
  const cursos = [...new Set(estudos.map(e => e.curso).filter(Boolean))];
  const selectCurso = document.getElementById('filtroDashboardCurso');
  selectCurso.innerHTML = '<option value="">Todos os Cursos</option>';
  cursos.sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    selectCurso.appendChild(opt);
  });

  const unidades = [...new Set(estudos.map(e => e.unidade).filter(Boolean))];
  const selectUnidade = document.getElementById('filtroDashboardUnidade');
  selectUnidade.innerHTML = '<option value="">Todas as Unidades</option>';
  unidades.sort().forEach(u => {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    selectUnidade.appendChild(opt);
  });
}

function atualizarDashboard() {
  const curso = document.getElementById('filtroDashboardCurso').value;
  const unidade = document.getElementById('filtroDashboardUnidade').value;
  let lista = estudos.filter(e => e.desempenho !== null);
  if (curso) lista = lista.filter(e => e.curso === curso);
  if (unidade) lista = lista.filter(e => e.unidade === unidade);

  const melhores = [...lista].sort((a, b) => (b.desempenho || 0) - (a.desempenho || 0)).slice(0, 5);
  const piores = [...lista].sort((a, b) => (a.desempenho || 0) - (b.desempenho || 0)).slice(0, 5);

  document.getElementById('dashboardMelhores').innerHTML = renderRanking(melhores);
  document.getElementById('dashboardPiores').innerHTML = renderRanking(piores);
}

function renderRanking(lista) {
  if (!lista || lista.length === 0) return '<p style="color:#6c757d;">Nenhum dado disponível.</p>';
  let html = `<div style="overflow-x:auto;"><table><thead><tr><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th style="text-align:center;">%</th></tr></thead><tbody>`;
  lista.forEach(e => {
    const cor = e.desempenho >= 80 ? '#16A34A' : '#DC2626';
    html += `<tr><td>${escapeHtml(e.codigo || '-')}</td><td>${escapeHtml(e.curso || '-')}</td><td>${escapeHtml(e.unidade || '-')}</td><td>${escapeHtml(e.conteudo || '-')}</td><td style="text-align:center;color:${cor};font-weight:600;">${e.desempenho}%</td></tr>`;
  });
  html += '</tbody></table></div>';
  return html;
}

// ============================================
// REGISTROS — só cadastro/edição/exclusão, SEM checkbox, SEM alerta de revisão
// ============================================
function renderizarRegistros() {
  const container = document.getElementById('registrosContainer');
  if (!container) return;
  const busca = document.getElementById('searchRegistros')?.value.toLowerCase() || '';
  // Tudo que ainda não precisa de revisão (concluído com desempenho >=80, ou ainda não realizado)
  let lista = estudos.filter(e => !(e.concluido && e.desempenho !== null && e.desempenho < 80));
  if (busca) {
    lista = lista.filter(e =>
      (e.curso && e.curso.toLowerCase().includes(busca)) ||
      (e.unidade && e.unidade.toLowerCase().includes(busca)) ||
      (e.conteudo && e.conteudo.toLowerCase().includes(busca))
    );
  }
  lista.sort((a, b) => (a.codigo || 0) - (b.codigo || 0));

  if (lista.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#6c757d;">Nenhum registro encontrado.</div>';
    return;
  }

  let html = `<div style="overflow-x:auto;"><table style="min-width:760px;">
    <thead><tr><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th>Data</th><th style="text-align:center;">Desempenho</th><th style="text-align:center;min-width:160px;">Ações</th></tr></thead><tbody>`;
  lista.forEach(e => {
    let badge = '';
    if (e.desempenho === null) badge = '<span class="badge-desempenho sem-dados">-</span>';
    else if (e.desempenho >= 80) badge = `<span class="badge-desempenho alto">${e.desempenho}%</span>`;
    else badge = `<span class="badge-desempenho baixo">${e.desempenho}%</span>`;
    html += `<tr>
      <td>${escapeHtml(e.codigo || '-')}</td>
      <td>${escapeHtml(e.curso || '-')}</td>
      <td>${escapeHtml(e.unidade || '-')}</td>
      <td>${escapeHtml(e.conteudo || '-')}</td>
      <td>${formatDate(e.dataEstudo)}</td>
      <td style="text-align:center;">${badge}</td>
      <td style="text-align:center;white-space:nowrap;">
        <button class="btn-action edit" data-action="editar" data-id="${escapeHtml(String(e.id))}">Editar</button>
        <button class="btn-action delete" data-action="excluir" data-id="${escapeHtml(String(e.id))}">Excluir</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Delegação de eventos: evita bugs de aspas em curso/conteúdo quebrando o onclick inline
  container.querySelectorAll('button[data-action]').forEach(btn => {
    const id = btn.dataset.id;
    if (btn.dataset.action === 'editar') btn.onclick = () => editarEstudo(id);
    if (btn.dataset.action === 'excluir') btn.onclick = () => excluirEstudo(id);
  });
}

function editarEstudo(id) {
  openModal(id, true);
}

async function excluirEstudo(id) {
  if (!confirm('Tem certeza que deseja excluir este estudo?')) return;
  estudos = estudos.filter(e => !sameId(e.id, id));
  salvarDados();
  await deletarNoServidor(id);
  preencherFiltrosDashboard();
  atualizarDashboard();
  renderizarRegistros();
  renderizarRevisoes();
  mostrarToast('Estudo excluído.', 'error');
}

// ============================================
// REVISÕES — checkbox para concluir revisão, SEM excluir (voltam para Registros sozinhas)
// ============================================
function renderizarRevisoes() {
  const container = document.getElementById('revisoesContainer');
  if (!container) return;
  const lista = estudos.filter(e => e.concluido && e.desempenho !== null && e.desempenho < 80)
    .sort((a, b) => (a.codigo || 0) - (b.codigo || 0));

  if (lista.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#6c757d;">Nenhuma revisão necessária.</div>';
    return;
  }

  let html = `<div style="overflow-x:auto;"><table style="min-width:760px;">
    <thead><tr><th style="width:45px;text-align:center;">✓</th><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th>Data</th><th style="text-align:center;">Desempenho</th></tr></thead><tbody>`;
  lista.forEach(e => {
    const badge = e.desempenho !== null ? `<span class="badge-desempenho baixo">${e.desempenho}%</span>` : '<span class="badge-desempenho sem-dados">-</span>';
    html += `<tr>
      <td style="text-align:center;">
        <div class="checkbox-wrapper">
          <input type="checkbox" class="styled-checkbox" id="chk-rev-${escapeHtml(String(e.id))}" data-id="${escapeHtml(String(e.id))}">
          <label for="chk-rev-${escapeHtml(String(e.id))}" class="checkbox-label-styled"></label>
        </div>
      </td>
      <td>${escapeHtml(e.codigo || '-')}</td>
      <td>${escapeHtml(e.curso || '-')}</td>
      <td>${escapeHtml(e.unidade || '-')}</td>
      <td>${escapeHtml(e.conteudo || '-')}</td>
      <td>${formatDate(e.dataEstudo)}</td>
      <td style="text-align:center;">${badge}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;

  container.querySelectorAll('input.styled-checkbox').forEach(chk => {
    chk.onchange = () => iniciarRevisao(chk.dataset.id, chk.checked);
  });
}

// ============================================
// REVISÃO - INICIAR
// ============================================
function iniciarRevisao(id, checked) {
  if (!checked) return;
  const estudo = estudos.find(e => sameId(e.id, id));
  if (!estudo) return;
  const chk = document.getElementById(`chk-rev-${id}`);
  if (chk) chk.checked = false;

  dadosParaRevisao = estudo;
  const modal = document.getElementById('formModal');
  document.getElementById('formModalTitle').textContent = `Revisão - ${estudo.curso} - ${estudo.conteudo || 'sem conteúdo'}`;
  document.getElementById('f_curso').value = estudo.curso || '';
  document.getElementById('f_unidade').value = estudo.unidade || '';
  document.getElementById('f_conteudo').value = estudo.conteudo || '';
  document.getElementById('f_dataEstudo').value = estudo.dataEstudo || '';
  document.getElementById('f_quantidade').value = estudo.quantidade || 0;
  document.getElementById('f_erros').value = estudo.erros || 0;

  document.querySelectorAll('.tab-btn').forEach(b => b.style.display = 'none');
  document.getElementById('tabBtnQuestoes').style.display = 'inline-block';
  document.getElementById('tabBtnQuestoes').click();
  document.getElementById('tabGeral').classList.remove('active');
  document.getElementById('tabQuestoes').classList.add('active');

  editandoId = estudo.id;
  modal.style.display = 'flex';
  modal.classList.add('show');
  modal.dataset.originalQuantidade = estudo.quantidade || 0;
}

// ============================================
// NOVO ESTUDO
// ============================================
function abrirModalNovoEstudo() {
  document.getElementById('modalExercicios').style.display = 'flex';
  document.getElementById('modalExercicios').classList.add('show');
}
function fecharModalExercicios() {
  const modal = document.getElementById('modalExercicios');
  modal.style.display = 'none';
  modal.classList.remove('show');
}
function respostaExercicios(sim) {
  fecharModalExercicios();
  openModal(null, sim);
}

function openModal(id = null, comQuestoes = true) {
  editandoId = id;
  dadosParaRevisao = null;
  const modal = document.getElementById('formModal');
  document.getElementById('formModalTitle').textContent = id ? 'Editar Estudo' : 'Novo Estudo';
  if (id) {
    const estudo = estudos.find(e => sameId(e.id, id));
    if (!estudo) { mostrarToast('Estudo não encontrado', 'error'); return; }
    document.getElementById('f_curso').value = estudo.curso || '';
    document.getElementById('f_unidade').value = estudo.unidade || '';
    document.getElementById('f_conteudo').value = estudo.conteudo || '';
    document.getElementById('f_dataEstudo').value = estudo.dataEstudo || '';
    document.getElementById('f_quantidade').value = estudo.quantidade || 0;
    document.getElementById('f_erros').value = estudo.erros || 0;
  } else {
    document.getElementById('f_curso').value = '';
    document.getElementById('f_unidade').value = '';
    document.getElementById('f_conteudo').value = '';
    document.getElementById('f_dataEstudo').value = '';
    document.getElementById('f_quantidade').value = 0;
    document.getElementById('f_erros').value = 0;
  }

  const tabQuestoes = document.getElementById('tabBtnQuestoes');
  document.querySelectorAll('.tab-btn').forEach(b => b.style.display = 'inline-block');
  tabQuestoes.style.display = comQuestoes ? 'inline-block' : 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="tabGeral"]').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tabGeral').classList.add('active');

  modal.style.display = 'flex';
  modal.classList.add('show');
  modal.dataset.semQuestoes = (!comQuestoes).toString();
}

function closeFormModal() {
  const modal = document.getElementById('formModal');
  modal.style.display = 'none';
  modal.classList.remove('show');
  editandoId = null;
  dadosParaRevisao = null;
  document.querySelectorAll('.tab-btn').forEach(b => b.style.display = 'inline-block');
}

function switchFormTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}

// ============================================
// SALVAR ESTUDO
// ============================================
async function salvarEstudo() {
  const curso = document.getElementById('f_curso').value.trim();
  const unidade = document.getElementById('f_unidade').value.trim();
  const conteudo = document.getElementById('f_conteudo').value.trim();
  const dataEstudo = document.getElementById('f_dataEstudo').value || null;
  let quantidade = parseInt(document.getElementById('f_quantidade').value) || 0;
  let erros = parseInt(document.getElementById('f_erros').value) || 0;

  if (!curso) {
    mostrarToast('O campo Curso é obrigatório.', 'error');
    return;
  }

  const modal = document.getElementById('formModal');
  const semQuestoes = modal.dataset.semQuestoes === 'true';
  if (semQuestoes && !editandoId) { quantidade = 0; erros = 0; }

  const desempenho = quantidade === 0 ? null : Math.round(((quantidade - erros) / quantidade) * 100);
  const isRevisao = dadosParaRevisao !== null;

  if (isRevisao) {
    const originalQtd = parseInt(modal.dataset.originalQuantidade) || 0;
    if (quantidade <= originalQtd) {
      mostrarToast('A quantidade de questões deve ser maior que a anterior.', 'error');
      return;
    }
  }

  if (editandoId) {
    const index = estudos.findIndex(e => sameId(e.id, editandoId));
    if (index === -1) { mostrarToast('Estudo não encontrado', 'error'); return; }
    const antigo = estudos[index];
    const atualizado = { ...antigo, curso, unidade, conteudo, dataEstudo, quantidade, erros, desempenho, concluido: true };
    estudos[index] = atualizado;
    salvarDados();
    const saved = await salvarNoServidor(atualizado);
    if (saved) { estudos[index] = { ...atualizado, id: saved.id, codigo: saved.codigo }; salvarDados(); }
    mostrarToast(isRevisao ? 'Revisão salva!' : 'Estudo atualizado!', 'success');
    closeFormModal();
  } else {
    const novoCodigo = obterProximoCodigo();
    let concluido = semQuestoes || (quantidade > 0);
    const novo = {
      id: gerarId(),
      codigo: novoCodigo,
      curso,
      unidade,
      conteudo,
      dataEstudo,
      quantidade,
      erros,
      desempenho: semQuestoes ? 100 : desempenho,
      concluido: semQuestoes ? true : concluido
    };
    estudos.push(novo);
    salvarDados();
    const saved = await salvarNoServidor(novo);
    if (saved) {
      const idx = estudos.findIndex(e => sameId(e.id, novo.id));
      if (idx !== -1) { estudos[idx] = { ...novo, id: saved.id, codigo: saved.codigo }; salvarDados(); }
    }
    mostrarToast('Estudo adicionado!', 'success');
    closeFormModal();
  }

  preencherFiltrosDashboard();
  atualizarDashboard();
  renderizarRegistros();
  renderizarRevisoes();
}

// ============================================
// AUXILIARES
// ============================================
function gerarId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function obterProximoCodigo() {
  let max = 0;
  estudos.forEach(e => { if (e.codigo && e.codigo > max) max = e.codigo; });
  return max + 1;
}
function formatDate(d) {
  if (!d) return '-';
  const partes = d.split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : d;
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function mostrarToast(msg, tipo = 'info') {
  document.querySelectorAll('.floating-message').forEach(el => el.remove());
  const div = document.createElement('div');
  div.className = `floating-message ${tipo}`;
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// ============================================
// EXPORTAÇÕES GLOBAIS
// ============================================
window.switchModule = switchModule;
window.abrirModalNovoEstudo = abrirModalNovoEstudo;
window.fecharModalExercicios = fecharModalExercicios;
window.respostaExercicios = respostaExercicios;
window.openModal = openModal;
window.closeFormModal = closeFormModal;
window.switchFormTab = switchFormTab;
window.salvarEstudo = salvarEstudo;
window.iniciarRevisao = iniciarRevisao;
window.atualizarDashboard = atualizarDashboard;
window.renderizarRegistros = renderizarRegistros;
window.renderizarRevisoes = renderizarRevisoes;
window.editarEstudo = editarEstudo;
window.excluirEstudo = excluirEstudo;
