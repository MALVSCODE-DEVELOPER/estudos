// ============================================
// CONFIGURAÇÃO – sem URL externa
// ============================================
// O frontend e o backend estão no mesmo servidor,
// então usamos caminhos relativos.
const API_URL = ''; // vazio → as requisições vão para o mesmo domínio

// ============================================
// ESTADO GLOBAL
// ============================================
let estudos = [];
let editandoId = null;
let filtroCurso = '';
let filtroHoje = false;
let filtroRevisao = false;
let filtroBusca = '';

// ============================================
// INICIALIZAÇÃO
// ============================================
async function inicializarApp() {
    const carregado = await carregarDoServidor();
    if (!carregado) carregarDados();
    preencherFiltros();
    renderizarTabela();
    atualizarDashboards();
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
                dataEstudo: e.dataEstudo || null,
                conteudo: e.conteudo || '',
                desempenho: calcularDesempenho(e)
            }));
            let maxCod = 0;
            estudos.forEach(e => { if (e.codigo && e.codigo > maxCod) maxCod = e.codigo; });
            estudos.forEach(e => { if (!e.codigo) { maxCod++; e.codigo = maxCod; } });
        } catch (e) { estudos = []; }
    } else {
        estudos = [];
    }
}

function salvarDados() {
    localStorage.setItem('estudosData', JSON.stringify(estudos));
}

function exportarDados() {
    const dataStr = JSON.stringify(estudos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_malvsstudy_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    mostrarToast('Backup baixado com sucesso!', 'success');
}

function importarDados(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const dados = JSON.parse(e.target.result);
            if (Array.isArray(dados)) {
                estudos = dados.map(estudo => ({ ...estudo, conteudo: estudo.conteudo || '', desempenho: calcularDesempenho(estudo) }));
                let maxCod = 0;
                estudos.forEach(est => { if (est.codigo && est.codigo > maxCod) maxCod = est.codigo; });
                estudos.forEach(est => { if (!est.codigo) { maxCod++; est.codigo = maxCod; } });
                salvarDados();
                await sincronizarTodosComServidor();
                preencherFiltros();
                renderizarTabela();
                atualizarDashboards();
                mostrarToast('Dados importados com sucesso!', 'success');
            } else {
                mostrarToast('Arquivo inválido.', 'error');
            }
        } catch (err) {
            mostrarToast('Erro ao ler o arquivo.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================
// COMUNICAÇÃO COM O BACKEND (caminhos relativos)
// ============================================
async function carregarDoServidor() {
    try {
        const response = await fetch('/api/estudos', {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) throw new Error('Erro ao carregar');
        const data = await response.json();
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
    } catch (error) {
        console.warn('⚠️ Não foi possível carregar do servidor, usando fallback local.', error);
        return false;
    }
}

// Verifica se o valor é um UUID válido (formato gerado pelo Supabase).
// IDs temporários criados localmente (ver gerarId()) NÃO são UUIDs,
// então nunca devem ser usados em PUT/PATCH/DELETE — isso causaria
// erro 500 no Supabase ("invalid input syntax for type uuid").
function isUUID(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

async function salvarNoServidor(estudo) {
    try {
        const temIdValido = isUUID(estudo.id);
        const method = temIdValido ? 'PUT' : 'POST';
        const url = temIdValido ? `/api/estudos/${estudo.id}` : '/api/estudos';
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
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
        if (!response.ok) throw new Error('Erro ao salvar');
        return await response.json();
    } catch (error) {
        console.error('❌ Erro ao salvar no servidor:', error);
        mostrarToast('Erro ao sincronizar com o servidor. Dados salvos localmente.', 'error');
        return null;
    }
}

async function deletarNoServidor(id) {
    // Se o id ainda não foi sincronizado com o Supabase (não é UUID),
    // o registro só existe localmente — não há o que excluir no servidor.
    if (!isUUID(id)) return true;
    try {
        const response = await fetch(`/api/estudos/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Erro ao deletar');
        return true;
    } catch (error) {
        console.error('❌ Erro ao deletar no servidor:', error);
        mostrarToast('Erro ao sincronizar exclusão com o servidor.', 'error');
        return false;
    }
}

async function atualizarStatusNoServidor(id, concluido) {
    // Registro só local (id não é UUID) ainda não existe no Supabase.
    if (!isUUID(id)) return null;
    try {
        const response = await fetch(`/api/estudos/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ concluido })
        });
        if (!response.ok) throw new Error('Erro ao atualizar status');
        return await response.json();
    } catch (error) {
        console.error('❌ Erro ao atualizar status no servidor:', error);
        mostrarToast('Erro ao sincronizar status com o servidor.', 'error');
        return null;
    }
}

async function sincronizarTodosComServidor() {
    for (const estudo of estudos) {
        await salvarNoServidor(estudo);
    }
    mostrarToast('Dados sincronizados com o servidor!', 'success');
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
// FILTROS E RENDERIZAÇÃO DA TABELA
// ============================================
function preencherFiltros() {
    const cursos = [...new Set(estudos.map(e => e.curso).filter(Boolean))];
    const selectCurso = document.getElementById('filterCurso');
    const valorAtual = selectCurso.value;
    selectCurso.innerHTML = '<option value="">Todos os Cursos</option>';
    cursos.sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        selectCurso.appendChild(opt);
    });
    selectCurso.value = valorAtual;

    const selectCursoDesempenho = document.getElementById('filtroDesempenhoCurso');
    if (selectCursoDesempenho) {
        const valAtual = selectCursoDesempenho.value;
        selectCursoDesempenho.innerHTML = '<option value="">Todos os Cursos</option>';
        cursos.sort().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            selectCursoDesempenho.appendChild(opt);
        });
        selectCursoDesempenho.value = valAtual;
    }
    const unidades = [...new Set(estudos.map(e => e.unidade).filter(Boolean))];
    const selectUnidadeDesempenho = document.getElementById('filtroDesempenhoUnidade');
    if (selectUnidadeDesempenho) {
        const valAtual = selectUnidadeDesempenho.value;
        selectUnidadeDesempenho.innerHTML = '<option value="">Todas as Unidades</option>';
        unidades.sort().forEach(u => {
            const opt = document.createElement('option');
            opt.value = u;
            opt.textContent = u;
            selectUnidadeDesempenho.appendChild(opt);
        });
        selectUnidadeDesempenho.value = valAtual;
    }
}

function applyFilters() {
    filtroBusca = document.getElementById('searchInput').value.toLowerCase();
    filtroCurso = document.getElementById('filterCurso').value;
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
        lista = lista.filter(e => 
            (e.unidade && e.unidade.toLowerCase().includes(filtroBusca)) ||
            (e.conteudo && e.conteudo.toLowerCase().includes(filtroBusca))
        );
    }
    if (filtroCurso) {
        lista = lista.filter(e => e.curso === filtroCurso);
    }
    if (filtroHoje) {
        const hoje = new Date().toISOString().slice(0,10);
        lista = lista.filter(e => e.dataEstudo === hoje);
    }
    if (filtroRevisao) {
        lista = lista.filter(e => {
            const d = calcularDesempenho(e);
            return d !== null && d < 80 && !e.concluido;
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
            <th>Curso</th>
            <th>Unidade</th>
            <th>Conteúdo</th>
            <th>Data</th>
            <th style="text-align:center;"></th>
            <th style="text-align:center;"></th>
            <th style="text-align:center;"></th>
        </tr></thead><tbody>`;
    lista.forEach(e => {
        const concluido = e.concluido || false;
        const desempenho = calcularDesempenho(e);
        const precisaRevisao = (desempenho !== null && desempenho < 80 && !concluido);
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
            <td><strong>${e.curso || '-'}</strong></td>
            <td>${e.unidade || '-'}</td>
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
// DASHBOARDS
// ============================================
function atualizarDashboards() {
    const hoje = new Date().toISOString().slice(0,10);
    const naoConcluidos = estudos.filter(e => e.dataEstudo && e.dataEstudo < hoje && !e.concluido).length;
    document.getElementById('statNaoConcluidos').textContent = naoConcluidos;

    const revisoes = estudos.filter(e => {
        const d = calcularDesempenho(e);
        return d !== null && d < 80 && !e.concluido;
    }).length;
    document.getElementById('statRevisoes').textContent = revisoes;

    const totalQuestoes = estudos.reduce((acc, e) => acc + (parseInt(e.quantidade) || 0), 0);
    document.getElementById('statQuestoes').textContent = totalQuestoes;

    const desempenhos = estudos.map(e => calcularDesempenho(e)).filter(d => d !== null);
    const media = desempenhos.length ? Math.round(desempenhos.reduce((a,b) => a+b, 0) / desempenhos.length) : 0;
    document.getElementById('statDesempenho').textContent = media + '%';
}

// ============================================
// MODAL DE QUESTÕES
// ============================================
let paginaQuestoes = 1;
let dadosQuestoes = [];

function abrirModalQuestoes(id = null) {
    const modal = document.getElementById('modalQuestoes');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('show');
    let lista = estudos.filter(e => (e.quantidade || 0) > 0);
    lista.sort((a, b) => (a.quantidade || 0) - (b.quantidade || 0));
    renderPaginaModalQuestoes(lista, 1);
}

function renderPaginaModalQuestoes(lista, pagina) {
    dadosQuestoes = lista;
    paginaQuestoes = pagina;
    const container = document.getElementById('conteudoModalQuestoes');
    if (!container) return;
    const porPagina = 5;
    const total = lista.length;
    const totalPaginas = Math.ceil(total / porPagina);
    const inicio = (pagina - 1) * porPagina;
    const fim = Math.min(inicio + porPagina, total);
    const paginaAtual = lista.slice(inicio, fim);

    if (paginaAtual.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Nenhum dado disponível.</p>';
        return;
    }

    let html = `<div style="overflow-x:auto;"><table>
        <thead><tr><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th style="text-align:center;">Questões</th></tr></thead><tbody>`;
    paginaAtual.forEach(e => {
        html += `<tr><td>${e.codigo || '-'}</td><td>${e.curso || '-'}</td><td>${e.unidade || '-'}</td><td>${e.conteudo || '-'}</td><td style="text-align:center;">${e.quantidade || 0}</td></tr>`;
    });
    html += `</tbody></table></div>`;

    if (totalPaginas > 1) {
        html += `<div class="paginacao">
            <button onclick="mudarPaginaQuestoes(-1)" ${pagina <= 1 ? 'disabled' : ''}>‹</button>
            <span>${pagina} / ${totalPaginas}</span>
            <button onclick="mudarPaginaQuestoes(1)" ${pagina >= totalPaginas ? 'disabled' : ''}>›</button>
        </div>`;
    }
    container.innerHTML = html;
}

function mudarPaginaQuestoes(delta) {
    const nova = paginaQuestoes + delta;
    const total = Math.ceil(dadosQuestoes.length / 5);
    if (nova < 1 || nova > total) return;
    renderPaginaModalQuestoes(dadosQuestoes, nova);
}

function fecharModalQuestoes() {
    const modal = document.getElementById('modalQuestoes');
    modal.style.display = 'none';
    modal.classList.remove('show');
}

// ============================================
// MODAL DE DESEMPENHO
// ============================================
let paginaDesempenho = 1;
let dadosDesempenho = [];

function abrirModalDesempenho() {
    const modal = document.getElementById('modalDesempenho');
    if (!modal) return;
    preencherFiltros();
    modal.style.display = 'flex';
    modal.classList.add('show');
    aplicarFiltrosDesempenho();
}

function aplicarFiltrosDesempenho() {
    const cursoFiltro = document.getElementById('filtroDesempenhoCurso').value;
    const unidadeFiltro = document.getElementById('filtroDesempenhoUnidade').value;
    let lista = estudos.filter(e => {
        const d = calcularDesempenho(e);
        return d !== null;
    });
    if (cursoFiltro) lista = lista.filter(e => e.curso === cursoFiltro);
    if (unidadeFiltro) lista = lista.filter(e => e.unidade === unidadeFiltro);
    lista.sort((a, b) => (calcularDesempenho(a) || 0) - (calcularDesempenho(b) || 0));
    dadosDesempenho = lista;
    paginaDesempenho = 1;
    renderPaginaModalDesempenho(lista, 1);
}

function renderPaginaModalDesempenho(lista, pagina) {
    const container = document.getElementById('conteudoModalDesempenho');
    if (!container) return;
    const porPagina = 5;
    const total = lista.length;
    const totalPaginas = Math.ceil(total / porPagina);
    const inicio = (pagina - 1) * porPagina;
    const fim = Math.min(inicio + porPagina, total);
    const paginaAtual = lista.slice(inicio, fim);

    if (paginaAtual.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Nenhum dado disponível.</p>';
        return;
    }

    let html = `<div style="overflow-x:auto;"><table>
        <thead><tr><th>Cód.</th><th>Curso</th><th>Unidade</th><th>Conteúdo</th><th style="text-align:center;">%</th></tr></thead><tbody>`;
    paginaAtual.forEach(e => {
        const d = calcularDesempenho(e);
        const cor = d >= 80 ? '#22C55E' : '#EF4444';
        html += `<tr><td>${e.codigo || '-'}</td><td>${e.curso || '-'}</td><td>${e.unidade || '-'}</td><td>${e.conteudo || '-'}</td><td style="text-align:center;color:${cor};font-weight:600;">${d}%</td></tr>`;
    });
    html += `</tbody></table></div>`;

    if (totalPaginas > 1) {
        html += `<div class="paginacao">
            <button onclick="mudarPaginaDesempenho(-1)" ${pagina <= 1 ? 'disabled' : ''}>‹</button>
            <span>${pagina} / ${totalPaginas}</span>
            <button onclick="mudarPaginaDesempenho(1)" ${pagina >= totalPaginas ? 'disabled' : ''}>›</button>
        </div>`;
    }
    container.innerHTML = html;
}

function mudarPaginaDesempenho(delta) {
    const nova = paginaDesempenho + delta;
    const total = Math.ceil(dadosDesempenho.length / 5);
    if (nova < 1 || nova > total) return;
    renderPaginaModalDesempenho(dadosDesempenho, nova);
}

function fecharModalDesempenho() {
    const modal = document.getElementById('modalDesempenho');
    modal.style.display = 'none';
    modal.classList.remove('show');
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
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function obterProximoCodigo() {
    let max = 0;
    estudos.forEach(e => { if (e.codigo && e.codigo > max) max = e.codigo; });
    return max + 1;
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
    const curso = document.getElementById('f_curso').value.trim();
    const unidade = document.getElementById('f_unidade').value.trim();
    const conteudo = document.getElementById('f_conteudo').value.trim();
    const dataEstudo = document.getElementById('f_dataEstudo').value || null;
    const quantidade = parseInt(document.getElementById('f_quantidade').value) || 0;
    const erros = parseInt(document.getElementById('f_erros').value) || 0;

    if (!curso) {
        mostrarToast('O campo Curso é obrigatório.', 'error');
        return;
    }

    const desempenho = quantidade === 0 ? null : Math.round(((quantidade - erros) / quantidade) * 100);

    if (editandoId) {
        const index = estudos.findIndex(e => e.id === editandoId);
        if (index === -1) { mostrarToast('Estudo não encontrado', 'error'); return; }
        const antigo = estudos[index];
        let concluido = antigo.concluido;
        if (quantidade > 0) {
            concluido = true;
        }
        const estudoAtualizado = {
            ...antigo,
            curso,
            unidade,
            conteudo,
            dataEstudo,
            quantidade,
            erros,
            desempenho,
            concluido
        };
        estudos[index] = estudoAtualizado;
        salvarDados();
        const saved = await salvarNoServidor(estudoAtualizado);
        if (saved) {
            estudos[index] = { ...estudoAtualizado, id: saved.id, codigo: saved.codigo };
            salvarDados();
        }
        mostrarToast('Estudo atualizado!', 'success');
    } else {
        const novoCodigo = obterProximoCodigo();
        const concluido = quantidade > 0;
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
            concluido
        };
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
    }
    preencherFiltros();
    renderizarTabela();
    atualizarDashboards();
    closeFormModal();
}

async function excluirEstudo(id) {
    if (!confirm('Tem certeza que deseja excluir este estudo?')) return;
    estudos = estudos.filter(e => e.id !== id);
    salvarDados();
    await deletarNoServidor(id);
    preencherFiltros();
    renderizarTabela();
    atualizarDashboards();
    mostrarToast('Estudo excluído.', 'error');
}

async function toggleConcluido(id, checked) {
    const estudo = estudos.find(e => e.id === id);
    if (!estudo) return;

    if (estudo.quantidade === 0 && checked) {
        openModal(id, 'tabQuestoes');
        const chk = document.getElementById(`chk-${id}`);
        if (chk) chk.checked = false;
        return;
    }

    estudo.concluido = checked;
    salvarDados();
    const saved = await atualizarStatusNoServidor(id, checked);
    if (saved) {
        estudo.concluido = saved.concluido;
        salvarDados();
    }
    renderizarTabela();
    atualizarDashboards();
    mostrarToast(checked ? 'Estudo concluído!' : 'Conclusão revertida.', checked ? 'success' : 'info');
}

function handleRowClick(event, id) {
    if (event.target.tagName === 'BUTTON' || event.target.closest('button') || event.target.closest('.checkbox-wrapper')) return;
    openModal(id, 'tabGeral');
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

// ============================================
// EXPORTAÇÃO GLOBAL
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
window.abrirModalDesempenho = abrirModalDesempenho;
window.fecharModalQuestoes = fecharModalQuestoes;
window.fecharModalDesempenho = fecharModalDesempenho;
window.mudarPaginaQuestoes = mudarPaginaQuestoes;
window.mudarPaginaDesempenho = mudarPaginaDesempenho;
window.aplicarFiltrosDesempenho = aplicarFiltrosDesempenho;
