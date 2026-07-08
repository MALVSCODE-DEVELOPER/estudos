const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // serve os arquivos estáticos

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: SUPABASE_URL e SUPABASE_KEY devem estar definidas no .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
//  HELPER – obter próximo código
// ============================================
async function getProximoCodigo() {
  const { data, error } = await supabase
    .from('estudos')
    .select('codigo')
    .order('codigo', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0) ? data[0].codigo + 1 : 1;
}

// ============================================
//  ROTAS DA API
// ============================================

// GET /api/estudos – listar todos
app.get('/api/estudos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('estudos')
      .select('*')
      .order('codigo', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/estudos – criar novo
app.post('/api/estudos', async (req, res) => {
  try {
    const { materia, conteudo, dataEstudo, quantidade, erros, concluido } = req.body;
    // validação básica
    if (!materia || !conteudo || !dataEstudo) {
      return res.status(400).json({ error: 'Matéria, Conteúdo e Data são obrigatórios' });
    }

    const qtd = parseInt(quantidade) || 0;
    const err = parseInt(erros) || 0;
    const desempenho = qtd === 0 ? null : Math.round(((qtd - err) / qtd) * 100);
    const concluidoFinal = (concluido !== undefined) ? concluido : (qtd > 0);

    const codigo = await getProximoCodigo();

    const { data, error } = await supabase
      .from('estudos')
      .insert([{
        codigo,
        materia,
        conteudo,
        dataEstudo,
        quantidade: qtd,
        erros: err,
        desempenho,
        concluido: concluidoFinal
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/estudos/:id – atualizar
app.put('/api/estudos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { materia, conteudo, dataEstudo, quantidade, erros, concluido } = req.body;

    if (!materia || !conteudo || !dataEstudo) {
      return res.status(400).json({ error: 'Matéria, Conteúdo e Data são obrigatórios' });
    }

    const qtd = parseInt(quantidade) || 0;
    const err = parseInt(erros) || 0;
    const desempenho = qtd === 0 ? null : Math.round(((qtd - err) / qtd) * 100);
    // Se quantidade > 0, marca como concluído automaticamente, a menos que seja explicitamente false
    let concluidoFinal = concluido;
    if (qtd > 0 && concluido === undefined) {
      concluidoFinal = true;
    } else if (qtd === 0) {
      concluidoFinal = false; // se zero questões, não pode estar concluído
    }

    const { data, error } = await supabase
      .from('estudos')
      .update({
        materia,
        conteudo,
        dataEstudo,
        quantidade: qtd,
        erros: err,
        desempenho,
        concluido: concluidoFinal,
        updated_at: new Date()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/estudos/:id
app.delete('/api/estudos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('estudos')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ message: 'Estudo removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import – importar dados (substitui todos)
app.post('/api/import', async (req, res) => {
  try {
    const dados = req.body;
    if (!Array.isArray(dados)) {
      return res.status(400).json({ error: 'Formato inválido: esperado array' });
    }

    // Busca o maior código atual para continuar a sequência
    const { data: maxData, error: maxError } = await supabase
      .from('estudos')
      .select('codigo')
      .order('codigo', { ascending: false })
      .limit(1);
    if (maxError) throw maxError;
    let proximoCodigo = (maxData && maxData.length > 0) ? maxData[0].codigo + 1 : 1;

    // Para cada item, gerar novo código e inserir
    const novosRegistros = dados.map(item => {
      const qtd = parseInt(item.quantidade) || 0;
      const err = parseInt(item.erros) || 0;
      const desempenho = qtd === 0 ? null : Math.round(((qtd - err) / qtd) * 100);
      const concluido = (item.concluido !== undefined) ? item.concluido : (qtd > 0);
      return {
        codigo: proximoCodigo++,
        materia: item.materia || '',
        conteudo: item.conteudo || '',
        dataEstudo: item.dataEstudo || new Date().toISOString().slice(0,10),
        quantidade: qtd,
        erros: err,
        desempenho,
        concluido
      };
    });

    const { data, error } = await supabase
      .from('estudos')
      .insert(novosRegistros)
      .select();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
