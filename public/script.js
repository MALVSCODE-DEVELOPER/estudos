// ============================================
// CONFIGURAÇÃO E ESTADO GLOBAL
// ============================================
let estudos = [];
let editandoId = null;
let filtroMateria = '';
let filtroHoje = false;
let filtroRevisao = false;
let filtroBusca = '';

// ============================================
// INICIALIZAÇÃO
// ============================================
async function inicializarApp() {
  await carregarDados();
  preencherFiltroMaterias();
  renderizarTabela();
  // Não perguntamos mais sobre backup automático
}

// ============================================
// COMUNICAÇÃO COM A API
// ============================================
const API_URL = '/api/estudos';

async function carregarDados() {
  try {
    const resp = await fetch(API_URL);
    if (!resp.ok) throw new Error('Erro ao carregar dados');
    const data = await resp.json();
    estudos = data.map(e => ({
      ...e,
      desempenho: e.desempenho !== undefined ? e.desempenho : null // já vem do banco
    }));
  } catch (err) {
    mostrarToast('Erro ao carregar dados: ' + err.message, 'error');
    estudos = [];
  }
}

async function salvarEstudoNoBackend(estudo, isEdit) {
  const url = isEdit ? `${API_URL}/${estudo.id}` : API_URL;
  const method = isEdit ? 'PUT' : 'POST';
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(estudo)
  });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Erro ao salvar');
  }
  return await resp.json();
}

async function excluirEstudoNoBackend(id) {
  const resp = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
  if (!resp.ok) {
    const err = await resp.json();
    throw new Error(err.error || 'Erro ao excluir');
  }
}

// ============================================
// PERSISTÊNCIA (local) – agora apenas cache
// ============================================
function salvarDados() {
  // não usamos mais localStorage, mas mantemos para compatibilidade com outras funções
  // na verdade, podemos remover, mas vou deixar vazio.
}

function exportarDados() {
  // exporta os dados atuais (em memória) como JSON
  const dataStr = JSON.stringify(estudos, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_estudos_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  mostrarToast('Backup baixado com sucesso!', 'success');
}

async function importarDados(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const dados = JSON.parse(e.target.result);
      if (!Array.isArray(dados)) throw new Error('Arquivo inválido');
      // Envia para importação (substitui tudo)
      const resp = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Erro na importação');
      }
      const novos = await resp.json();
      // Recarrega a lista completa do banco para garantir consistência
      await carregarDados();
      preencherFiltroMaterias();
      renderizarTabela();
      mostrarToast('Dados importados com sucesso!', 'success');
    } catch (err) {
      mostrarToast('Erro ao importar: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================
// CÁLCULO DE DESEMPENHO (já vem do backend, mas mantemos para uso local)
// ============================================
function calcularDesempenho(estudo) {
  const q = parseInt(estudo.quantidade) || 0;
  const e = parseInt(estudo.erros) || 0;
  if (q === 0) return null;
  return Math.round(((q - e) / q) * 100);
}

// ============================================
// FILTROS E RENDERIZAÇÃO
// ============================================
function preencherFiltroMaterias() {
  const materias = [...new Set(estudos.map(e => e.materia).filter(Boolean))];
  const select = document.getElementById('filterMateria');
  const valorAtual = select.value;
  select.innerHTML = '<option value="">Todas Matérias</option>';
  materias.sort().forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });
  select.value = valorAtual;
}

function applyFilters() {
  filtroBusca = document.getElementById('searchInput').value.toLowerCase();
  filtroMateria = document.getElementById('filterMateria').value;
  renderizarTabela();
}

function toggleTodayFilter() {
  filtroHoje = !filtroHoje;
  document.getElementById('btnCalendar').classList.toggle('active', filtroHoje);
  renderizarTabela();
}

function toggleRevisaoFilter() {
  filtroRevisao = !filtroRevisao;
  document.getElementById('btnRevisao').classList.toggle('active', filtroRevisao);
  renderizarTabela();
}

function getEstudosFiltrados() {
  let lista = [...estudos];
  if (filtroBusca) {
    lista = lista.filter(e => e.conteudo && e.conteudo.toLowerCase().includes(filtroBusca));
  }
  if (filtroMateria) {
    lista = lista.filter(e => e.materia === filtroMateria);
  }
  if (filtroHoje) {
    const hoje = new Date().toISOString().slice(0,10);
    lista = lista.filter(e => e.dataEstudo === hoje);
  }
  if (filtroRevisao) {
    lista = lista.filter(e => {
      const d = e.desempenho !== undefined ? e.desempenho : calcularDesempenho(e);
      return d !== null && d < 80;
    });
  }
  lista.sort((a, b) => (a.codigo || 0) - (b.codigo || 0));
  return lista;
}

function renderizarTabela() {
  const container = document.getElementById('registrosContainer');
  if (!container) return;
  const lista = getEstudosFiltrados();
  if (lista.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhum estudo encontrado.</div>';
    return;
  }
  let html = `<div style="overflow-x:auto;"><table>
        <thead><tr>
            <th style="text-align:center;">✓</th>
            <th style="text-align:center;">Cód.</th>
            <th>Matéria</th>
            <th>Conteúdo</th>
            <th>Data</th>
            <th style="text-align:center;">Desempenho</th>
            <th style="text-align:center;"></th>
            <th style="text-align:center;">Ações</th>
        </tr></thead><tbody>`;
  lista.forEach(e => {
    const concluido = e.concluido || false;
    const desempenho = e.desempenho !== undefined ? e.desempenho : calcularDesempenho(e);
    const precisaRevisao = (desempenho !== null && desempenho < 80);
    const rowClass = concluido ? 'row-concluido' : '';
    let badgeHtml = '';
    if (desempenho === null) {
      badgeHtml = '<span class="badge badge-desempenho sem-dados">-</span>';
    } else if (desempenho >= 80) {
      badgeHtml = `<span class="badge badge-desempenho alto">${desempenho}%</span>`;
    } else {
      badgeHtml = `<span class="badge badge-desempenho baixo">${desempenho}%</span>`;
    }
    const alertIcon = precisaRevisao ? `
            <button class="action-btn alert-icon" onclick="event.stopPropagation();abrirModalQuestoes('${e.id}')" title="Precisa de revisão (desempenho < 80%)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            </button>` : '';

    const checkboxDisabled = (e.quantidade === 0) ? 'disabled' : '';

    html += `<tr class="${rowClass} row-clickable" data-id="${e.id}" onclick="handleRowClick(event, '${e.id}')">
            <td style="text-align:center;">
                <div class="checkbox-wrapper">
                    <input type="checkbox" class="styled-checkbox" id="chk-${e.id}" ${concluido ? 'checked' : ''} 
                           onchange="toggleConcluido('${e.id}', this.checked)" 
                           onclick="event.stopPropagation()"
                           ${checkboxDisabled}>
                    <label for="chk-${e.id}" class="checkbox-label-styled" onclick="event.stopPropagation()"></label>
                </div>
            </td>
            <td style="text-align:center;font-weight:600;">${e.codigo || '-'}</td>
            <td><strong>${e.materia || '-'}</strong></td>
            <td style="max-width:200px;word-wrap:break-word;white-space:normal;">${e.conteudo || '-'}</td>
            <td style="white-space:nowrap;">${formatDate(e.dataEstudo)}</td>
            <td style="text-align:center;">${badgeHtml}</td>
            <td style="text-align:center;">${alertIcon}</td>
            <td class="actions-cell" style="text-align:center;white-space:nowrap;">
                <button class="action-btn delete" onclick="event.stopPropagation();excluirEstudo('${e.id}')" title="Excluir">Excluir</button>
            </td>
        </tr>`;
  });
  html += `</tbody></table></div>`;
  container.innerHTML = html;
}

// ============================================
// FORMATAÇÃO DE DATA
// ============================================
function formatDate(d) {
  if (!d) return '-';
  const partes = d.split('-');
  if (partes.length !== 3) return d;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// ============================================
// MANIPULAÇÃO DE ESTUDOS (CRUD)
// ============================================
function gerarId() {
  // não usado mais, mas mantido
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function abrirModalQuestoes(id) {
  openModal(id, 'tabQuestoes');
}

function openModal(id = null, tab = 'tabGeral') {
  editandoId = id;
  const modal = document.getElementById('formModal');
  const title = document.getElementById('formModalTitle');
  if (id) {
    const estudo = estudos.find(e => e.id === id);
    if (!estudo) { mostrarToast('Estudo não encontrado', 'error'); return; }
    title.textContent = 'Editar Estudo';
    document.getElementById('f_materia').value = estudo.materia || '';
    document.getElementById('f_conteudo').value = estudo.conteudo || '';
    document.getElementById('f_dataEstudo').value = estudo.dataEstudo || '';
    document.getElementById('f_quantidade').value = estudo.quantidade || 0;
    document.getElementById('f_erros').value = estudo.erros || 0;
  } else {
    title.textContent = 'Novo Estudo';
    document.getElementById('f_materia').value = '';
    document.getElementById('f_conteudo').value = '';
    document.getElementById('f_dataEstudo').value = new Date().toISOString().slice(0,10);
    document.getElementById('f_quantidade').value = 0;
    document.getElementById('f_erros').value = 0;
  }
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const tabEl = document.getElementById(tab);
  if (tabEl) tabEl.classList.add('active');
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  modal.style.display = 'flex';
  modal.classList.add('show');
}

function closeFormModal() {
  const modal = document.getElementById('formModal');
  modal.style.display = 'none';
  modal.classList.remove('show');
  editandoId = null;
}

function switchFormTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}

async function salvarEstudo() {
  const materia = document.getElementById('f_materia').value.trim();
  const conteudo = document.getElementById('f_conteudo').value.trim();
  const dataEstudo = document.getElementById('f_dataEstudo').value;
  const quantidade = parseInt(document.getElementById('f_quantidade').value) || 0;
  const erros = parseInt(document.getElementById('f_erros').value) || 0;

  if (!materia || !conteudo || !dataEstudo) {
    mostrarToast('Preencha Matéria, Conteúdo e Data do Estudo.', 'error');
    return;
  }

  const estudoData = {
    materia,
    conteudo,
    dataEstudo,
    quantidade,
    erros
    // concluido será definido pelo backend
  };

  try {
    let resultado;
    if (editandoId) {
      // Atualização
      const estudoExistente = estudos.find(e => e.id === editandoId);
      if (!estudoExistente) throw new Error('Estudo não encontrado');
      // Mantém o concluido atual, a menos que a quantidade mude para >0 (o backend define)
      estudoData.concluido = estudoExistente.concluido;
      resultado = await salvarEstudoNoBackend({ ...estudoData, id: editandoId }, true);
      // Atualiza no array local
      const index = estudos.findIndex(e => e.id === editandoId);
      if (index !== -1) estudos[index] = resultado;
      mostrarToast('Estudo atualizado!', 'success');
    } else {
      // Novo
      resultado = await salvarEstudoNoBackend(estudoData, false);
      estudos.push(resultado);
      mostrarToast('Estudo adicionado!', 'success');
    }
    salvarDados(); // vazio, mas mantido
    preencherFiltroMaterias();
    renderizarTabela();
    closeFormModal();
  } catch (err) {
    mostrarToast('Erro ao salvar: ' + err.message, 'error');
  }
}

async function excluirEstudo(id) {
  if (!confirm('Tem certeza que deseja excluir este estudo?')) return;
  try {
    await excluirEstudoNoBackend(id);
    estudos = estudos.filter(e => e.id !== id);
    salvarDados();
    preencherFiltroMaterias();
    renderizarTabela();
    mostrarToast('Estudo excluído.', 'error');
  } catch (err) {
    mostrarToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// ============================================
// TOGGLE DE CONCLUÍDO (checkbox)
// ============================================
async function toggleConcluido(id, checked) {
  const estudo = estudos.find(e => e.id === id);
  if (!estudo) return;

  // Se quantidade for 0 e tentar marcar, abre modal de questões
  if (estudo.quantidade === 0 && checked) {
    openModal(id, 'tabQuestoes');
    const chk = document.getElementById(`chk-${id}`);
    if (chk) chk.checked = false;
    return;
  }

  // Atualiza no backend
  try {
    const dadosAtualizados = { ...estudo, concluido: checked };
    const resultado = await salvarEstudoNoBackend(dadosAtualizados, true);
    // Atualiza no array local
    const index = estudos.findIndex(e => e.id === id);
    if (index !== -1) estudos[index] = resultado;
    renderizarTabela();
    mostrarToast(checked ? 'Estudo concluído!' : 'Conclusão revertida.', checked ? 'success' : 'info');
  } catch (err) {
    mostrarToast('Erro ao atualizar: ' + err.message, 'error');
    // Reverte o checkbox visualmente
    const chk = document.getElementById(`chk-${id}`);
    if (chk) chk.checked = !checked;
  }
}

// ============================================
// CLIQUE NA LINHA (abre modal na aba Geral)
// ============================================
function handleRowClick(event, id) {
  if (event.target.tagName === 'BUTTON' || event.target.closest('button') || event.target.closest('.checkbox-wrapper')) return;
  openModal(id, 'tabGeral');
}

// ============================================
// TOASTS
// ============================================
function mostrarToast(mensagem, tipo = 'info') {
  document.querySelectorAll('.floating-message').forEach(el => el.remove());
  const div = document.createElement('div');
  div.className = `floating-message ${tipo}`;
  div.textContent = mensagem;
  document.body.appendChild(div);
  setTimeout(() => {
    div.style.animation = 'slideOutBottom 0.3s ease forwards';
    setTimeout(() => div.remove(), 300);
  }, 3000);
}

// ============================================
// EXPORTAÇÃO PARA O ESCOPO GLOBAL
// ============================================
window.inicializarApp = inicializarApp;
window.applyFilters = applyFilters;
window.toggleTodayFilter = toggleTodayFilter;
window.toggleRevisaoFilter = toggleRevisaoFilter;
window.openModal = openModal;
window.closeFormModal = closeFormModal;
window.switchFormTab = switchFormTab;
window.salvarEstudo = salvarEstudo;
window.excluirEstudo = excluirEstudo;
window.toggleConcluido = toggleConcluido;
window.handleRowClick = handleRowClick;
window.importarDados = importarDados;
window.exportarDados = exportarDados;
window.abrirModalQuestoes = abrirModalQuestoes;
