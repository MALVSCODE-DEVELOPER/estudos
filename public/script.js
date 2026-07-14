// ============================================
// CONFIGURAÇÃO
// ============================================
const API_URL = '';
let estudos = [];
let editandoId = null;
let moduloAtual = 'dashboard';
let dadosParaRevisao = null; // armazena o estudo que está sendo revisado

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
        dataEstudo: e.data_estudo || null,
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
// COMUNICAÇÃO COM O BACKEND
// ============================================
async function carregarDoServidor() {
  try {
    const resp = await fetch('/api/estudos', { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('Erro');
    const data = await resp.json();
    if (data && Array.isArray(data)) {
      estudos = data.map(e => ({
        ...e,
        dataEstudo: e.data_estudo || null,
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
    if (!resp.ok) throw new Error('Erro ao salvar');
    return await resp.json();
  } catch (error) {
    console.error('❌ Erro no servidor:', error);
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

async function atualizarStatusNoServidor(id, data) {
  try {
    const resp = await fetch(`/api/estudos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error('Erro');
    return await resp.json();
  } catch { return null; }
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
// NAVEGAÇÃO ENTRE MÓDULOS
// ============================================
function switchModule(modulo) {
  moduloAtual = modulo;
  document.querySelectorAll('.module').forEach(el => el.classList.remove('active'));
  document.getElementById(`module-${modulo}`).classList.add('active');
  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`.menu-item[data-modulo="${modulo}"]`).classList.add('active');
  if (modulo === 'dashboard') atualizarDashboard();
  if (modulo === 'registros') renderizarRegistros();
  if (modulo === 'revisoes') renderizarRevisoes();
}

// ============================================
// DASHBOARD
// ============================================
function preencherFiltrosDashboard() {
  const cursos = [...new Set(estudos.map(e => e.curso).filter(Boolean))];
  const selectCurso = document.getElementById('filtroDashboardCurso');
  const valCurso = selectCurso.value;
  selectCurso.innerHTML = '<option value="">Todos os Cursos</option>';
  cursos.sort().forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    selectCurso.appendChild(opt);
  });
  selectCurso.value = valCurso;

  const unidades = [...new Set(estudos.map(e => e.unidade).filter(Boolean))];
  const selectUnidade = document.getElementById('filtroDashboardUnidade');
  const valUnidade = selectUnidade.value;
  selectUnidade.innerHTML = '<option value="">Todas as Unidades</option>';
  unidades.sort().forEach(u => {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    selectUnidade.appendChild(opt);
  });
  selectUnidade.value = valUnidade;
}

function atualizarDashboard() {
  const curso = document.getElementById('filtroDashboardCurso').value;
  const unidade = document.getElementById('filtroDashboardUnidade').value;
  let lista = estudos.filter(e => e.desempenho !== null);
  if (curso) lista = lista.filter(e => e.curso === curso);
  if (unidade) lista = lista.filter(e => e.unidade === unidade);

  // Melhores (5 maiores desempenhos)
  const melhores = [...lista].sort((a,b) => (b.desempenho || 0) - (a.desempenho || 0)).slice(0,5);
  // Piores (5 menores)
  const piores = [...lista].sort((a,b) => (a.desempenho || 0) - (b.desempenho || 0)).slice(0,5);

  document.getElementById('dashboardMelhores').innerHTML = renderizarTabelaRanking(melhores, 'alto');
  document.getElementById('dashboardPiores').innerHTML = renderizarTabelaRanking(piores, 'baixo');
}

function renderizarTabelaRanking(lista, tipo) {
  if (!lista || lista.length === 0) return '<p style="color:var(--text-secondary);">Nenhum dado disponível.</p>';
  let html = `<table><thead><tr><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th style="text-align:center;">%</th></tr></thead><tbody>`;
  lista.forEach(e => {
    const cor = e.desempenho >= 80 ? '#22C55E' : '#EF4444';
    html += `<tr><td>${e.codigo || '-'}</td><td>${e.curso || '-'}</td><td>${e.unidade || '-'}</td><td>${e.conteudo || '-'}</td><td style="text-align:center;color:${cor};font-weight:600;">${e.desempenho}%</td></tr>`;
  });
  html += '</tbody></table>';
  return html;
}

// ============================================
// REGISTROS (sem checkbox, sem filtros)
// ============================================
function renderizarRegistros() {
  const container = document.getElementById('registrosContainer');
  if (!container) return;
  // Mostra apenas os que NÃO estão em revisão (concluido true e desempenho >=80) ou pendentes (concluido false)
  const lista = estudos.filter(e => {
    if (e.concluido && e.desempenho !== null && e.desempenho < 80) return false; // está em revisão
    return true;
  }).sort((a,b) => (a.codigo || 0) - (b.codigo || 0));

  if (lista.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhum registro encontrado.</div>';
    return;
  }

  let html = `<div style="overflow-x:auto;"><table>
    <thead><tr><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th>Data</th><th style="text-align:center;">Desempenho</th></tr></thead><tbody>`;
  lista.forEach(e => {
    const desempenho = e.desempenho;
    let badge = '';
    if (desempenho === null) badge = '<span class="badge-desempenho sem-dados">-</span>';
    else if (desempenho >= 80) badge = `<span class="badge-desempenho alto">${desempenho}%</span>`;
    else badge = `<span class="badge-desempenho baixo">${desempenho}%</span>`;
    html += `<tr>
      <td>${e.codigo || '-'}</td>
      <td>${e.curso || '-'}</td>
      <td>${e.unidade || '-'}</td>
      <td>${e.conteudo || '-'}</td>
      <td>${formatDate(e.dataEstudo)}</td>
      <td style="text-align:center;">${badge}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ============================================
// REVISÕES (com checkbox e sem botão excluir)
// ============================================
function renderizarRevisoes() {
  const container = document.getElementById('revisoesContainer');
  if (!container) return;
  // Mostra apenas os que precisam revisão: concluido = true e desempenho < 80
  const lista = estudos.filter(e => e.concluido && e.desempenho !== null && e.desempenho < 80)
    .sort((a,b) => (a.codigo || 0) - (b.codigo || 0));

  if (lista.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">Nenhuma revisão necessária.</div>';
    return;
  }

  let html = `<div style="overflow-x:auto;"><table>
    <thead><tr><th style="width:45px;text-align:center;">✓</th><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th>Data</th><th style="text-align:center;">Desempenho</th></tr></thead><tbody>`;
  lista.forEach(e => {
    const desempenho = e.desempenho;
    const badge = desempenho !== null ? `<span class="badge-desempenho baixo">${desempenho}%</span>` : '<span class="badge-desempenho sem-dados">-</span>';
    html += `<tr data-id="${e.id}">
      <td style="text-align:center;">
        <div class="checkbox-wrapper">
          <input type="checkbox" class="styled-checkbox" id="chk-rev-${e.id}" onchange="iniciarRevisao('${e.id}', this.checked)">
          <label for="chk-rev-${e.id}" class="checkbox-label-styled"></label>
        </div>
      </td>
      <td>${e.codigo || '-'}</td>
      <td>${e.curso || '-'}</td>
      <td>${e.unidade || '-'}</td>
      <td>${e.conteudo || '-'}</td>
      <td>${formatDate(e.dataEstudo)}</td>
      <td style="text-align:center;">${badge}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// ============================================
// REVISÃO - ABRIR MODAL DE QUESTÕES
// ============================================
function iniciarRevisao(id, checked) {
  if (!checked) return; // só trata quando marcar
  const estudo = estudos.find(e => e.id === id);
  if (!estudo) return;
  // Desmarcar checkbox (será marcado após salvar se for bem-sucedido)
  const chk = document.getElementById(`chk-rev-${id}`);
  if (chk) chk.checked = false;

  // Abrir modal de revisão (apenas aba Questões)
  dadosParaRevisao = estudo;
  openModalRevisao(estudo);
}

function openModalRevisao(estudo) {
  const modal = document.getElementById('formModal');
  const title = document.getElementById('formModalTitle');
  title.textContent = `Revisão - ${estudo.curso} - ${estudo.conteudo || 'sem conteúdo'}`;
  // Preencher campos com dados atuais
  document.getElementById('f_curso').value = estudo.curso || '';
  document.getElementById('f_unidade').value = estudo.unidade || '';
  document.getElementById('f_conteudo').value = estudo.conteudo || '';
  document.getElementById('f_dataEstudo').value = estudo.dataEstudo || '';
  document.getElementById('f_quantidade').value = estudo.quantidade || 0;
  document.getElementById('f_erros').value = estudo.erros || 0;

  // Esconder a aba Geral e mostrar apenas Questões
  document.querySelectorAll('.tab-btn').forEach(b => b.style.display = 'none');
  document.getElementById('tabBtnQuestoes').style.display = 'inline-block';
  document.getElementById('tabBtnQuestoes').click();
  // Esconder a aba Geral
  document.getElementById('tabGeral').classList.remove('active');
  document.getElementById('tabQuestoes').classList.add('active');

  editandoId = estudo.id; // para atualizar
  modal.style.display = 'flex';
  modal.classList.add('show');
  // Armazenar o estudo original para comparar quantidades depois
  modal.dataset.originalQuantidade = estudo.quantidade || 0;
}

// ============================================
// NOVO ESTUDO - MODAL DE CONFIRMAÇÃO
// ============================================
let respostaExerciciosPendente = false;
let dadosNovoEstudo = null;

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
  if (sim) {
    // Abrir modal com ambas as abas
    openModal(null, true);
  } else {
    // Abrir modal apenas com a aba Geral, e ao salvar, definirá concluido=true, desempenho=100%
    openModal(null, false);
  }
}

// ============================================
// MODAL DE FORMULÁRIO (GERAL/QUESTÕES)
// ============================================
function openModal(id = null, comQuestoes = true) {
  editandoId = id;
  const modal = document.getElementById('formModal');
  const title = document.getElementById('formModalTitle');
  if (id) {
    const estudo = estudos.find(e => e.id === id);
    if (!estudo) { mostrarToast('Estudo não encontrado', 'error'); return; }
    title.textContent = 'Editar Estudo';
    document.getElementById('f_curso').value = estudo.curso || '';
    document.getElementById('f_unidade').value = estudo.unidade || '';
    document.getElementById('f_conteudo').value = estudo.conteudo || '';
    document.getElementById('f_dataEstudo').value = estudo.dataEstudo || '';
    document.getElementById('f_quantidade').value = estudo.quantidade || 0;
    document.getElementById('f_erros').value = estudo.erros || 0;
  } else {
    title.textContent = 'Novo Estudo';
    document.getElementById('f_curso').value = '';
    document.getElementById('f_unidade').value = '';
    document.getElementById('f_conteudo').value = '';
    document.getElementById('f_dataEstudo').value = '';
    document.getElementById('f_quantidade').value = 0;
    document.getElementById('f_erros').value = 0;
  }

  // Controlar visibilidade das abas
  const tabQuestoes = document.getElementById('tabBtnQuestoes');
  if (comQuestoes) {
    tabQuestoes.style.display = 'inline-block';
    // Ativar aba Geral por padrão
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="tabGeral"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tabGeral').classList.add('active');
  } else {
    tabQuestoes.style.display = 'none';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="tabGeral"]').classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tabGeral').classList.add('active');
  }

  modal.style.display = 'flex';
  modal.classList.add('show');
  // Sinalizar se veio sem questões
  modal.dataset.semQuestoes = (!comQuestoes).toString();
}

function closeFormModal() {
  const modal = document.getElementById('formModal');
  modal.style.display = 'none';
  modal.classList.remove('show');
  editandoId = null;
  dadosParaRevisao = null;
  document.querySelectorAll('.tab-btn').forEach(b => b.style.display = 'inline-block'); // restaurar abas
}

function switchFormTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  btn.classList.add('active');
}

// ============================================
// SALVAR ESTUDO (CRIAR OU ATUALIZAR)
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

  // Se for novo estudo sem questões, forçar desempenho 100% e concluido
  if (semQuestoes && !editandoId) {
    quantidade = 0;
    erros = 0;
  }

  const desempenho = quantidade === 0 ? null : Math.round(((quantidade - erros) / quantidade) * 100);

  // Lógica de revisão: se é uma revisão (dadosParaRevisao existe)
  const isRevisao = dadosParaRevisao !== null;

  if (isRevisao) {
    // Verifica se a quantidade de questões aumentou
    const originalQtd = parseInt(modal.dataset.originalQuantidade) || 0;
    if (quantidade <= originalQtd) {
      mostrarToast('A quantidade de questões deve ser maior que a anterior para validar a revisão.', 'error');
      return;
    }
  }

  if (editandoId) {
    const index = estudos.findIndex(e => e.id === editandoId);
    if (index === -1) { mostrarToast('Estudo não encontrado', 'error'); return; }
    const antigo = estudos[index];
    let concluido = antigo.concluido;

    // Se for revisão, atualizar e depois verificar se melhora
    const estudoAtualizado = {
      ...antigo,
      curso,
      unidade,
      conteudo,
      dataEstudo,
      quantidade,
      erros,
      desempenho,
      concluido: true // ao revisar, marcamos como concluído
    };

    estudos[index] = estudoAtualizado;
    salvarDados();
    const saved = await salvarNoServidor(estudoAtualizado);
    if (saved) {
      estudos[index] = { ...estudoAtualizado, id: saved.id, codigo: saved.codigo };
      salvarDados();
    }
    mostrarToast('Estudo atualizado!', 'success');
    closeFormModal();
  } else {
    // Novo estudo
    const novoCodigo = obterProximoCodigo();
    let concluido = semQuestoes; // se não fez exercícios, já está concluído
    if (!semQuestoes && quantidade > 0) concluido = true; // se fez e colocou questões, concluído
    // Se fez exercícios mas desempenho < 80, será colocado em revisão (concluido true, desempenho < 80)
    const novoEstudo = {
      id: gerarId(),
      codigo: novoCodigo,
      curso,
      unidade,
      conteudo,
      dataEstudo,
      quantidade,
      erros,
      desempenho,
      concluido: concluido || (quantidade > 0) // se colocou questões, é concluído
    };
    // Se não fez exercícios, forçar desempenho 100% e concluido true
    if (semQuestoes) {
      novoEstudo.desempenho = 100;
      novoEstudo.concluido = true;
    }

    estudos.push(novoEstudo);
    salvarDados();
    const saved = await salvarNoServidor(novoEstudo);
    if (saved) {
      const idx = estudos.findIndex(e => e.id === novoEstudo.id);
      if (idx !== -1) {
        estudos[idx] = { ...novoEstudo, id: saved.id, codigo: saved.codigo };
        salvarDados();
      }
    }
    mostrarToast('Estudo adicionado!', 'success');
    closeFormModal();
  }

  // Atualizar todos os módulos
  preencherFiltrosDashboard();
  atualizarDashboard();
  renderizarRegistros();
  renderizarRevisoes();
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function obterProximoCodigo() {
  let max = 0;
  estudos.forEach(e => { if (e.codigo && e.codigo > max) max = e.codigo; });
  return max + 1;
}

function formatDate(d) {
  if (!d) return '-';
  const partes = d.split('-');
  if (partes.length !== 3) return d;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

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

// Exportar funções globais
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
window.gerarId = gerarId;
window.obterProximoCodigo = obterProximoCodigo;
