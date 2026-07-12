require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// SUPABASE
// ============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ROTAS DA API
// ============================================

// GET /api/estudos
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

// POST /api/estudos
app.post('/api/estudos', async (req, res) => {
  try {
    const { curso, unidade, conteudo, data_estudo, quantidade, erros, desempenho, concluido } = req.body;
    if (!curso) return res.status(400).json({ error: 'Curso é obrigatório' });

    const { data: maxData } = await supabase
      .from('estudos')
      .select('codigo')
      .order('codigo', { ascending: false })
      .limit(1);
    const proximoCodigo = (maxData && maxData[0]?.codigo || 0) + 1;

    const novo = {
      codigo: proximoCodigo,
      curso,
      unidade: unidade || '',
      conteudo: conteudo || '',
      data_estudo: data_estudo || null,
      quantidade: quantidade || 0,
      erros: erros || 0,
      desempenho: desempenho || null,
      concluido: concluido || false,
    };

    const { data, error } = await supabase
      .from('estudos')
      .insert([novo])
      .select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/estudos/:id
app.put('/api/estudos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { curso, unidade, conteudo, data_estudo, quantidade, erros, desempenho, concluido } = req.body;
    if (!curso) return res.status(400).json({ error: 'Curso é obrigatório' });

    const updates = {
      curso,
      unidade: unidade || '',
      conteudo: conteudo || '',
      data_estudo: data_estudo || null,
      quantidade: quantidade || 0,
      erros: erros || 0,
      desempenho: desempenho || null,
      concluido: concluido || false,
    };

    const { data, error } = await supabase
      .from('estudos')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Estudo não encontrado' });
    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/estudos/:id
app.patch('/api/estudos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.codigo;
    delete updates.created_at;

    const { data, error } = await supabase
      .from('estudos')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Estudo não encontrado' });
    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/estudos/:id
app.delete('/api/estudos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('estudos')
      .delete()
      .eq('id', id)
      .select();
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'Estudo não encontrado' });
    res.json({ message: 'Excluído', deleted: data[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback para SPA (opcional)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// INICIAR
// ============================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 Conectado ao Supabase: ${supabaseUrl}`);
  console.log(`📁 Servindo arquivos estáticos da pasta 'public'`);
});
