const path = require('path');
const express = require('express');
const cors = require('cors');
const { initDb, get, all, run } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function formatActivityRow(row) {
  return {
    id: row.id,
    title: row.tipo.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
    type: row.tipo,
    user: {
      id: row.usuario_id,
      name: row.nome_usuario,
      photoUrl: row.url_foto,
    },
    distanceMeters: Number(row.distancia_metros),
    durationMinutes: Number(row.duracao_minutos),
    co2Kg: Number(row.co2_kg),
    createdAt: new Date(row.data_criacao).toISOString(),
    // COUNT(*) no Postgres retorna BIGINT, que o driver "pg" entrega como string.
    likesCount: Number(row.total_curtidas),
    commentsCount: Number(row.total_comentarios),
    likedByCurrentUser: Number(row.curtida_usuario_logado) > 0,
  };
}

async function getGlobalStats() {
  const stats = await get(`
    SELECT
      COUNT(*) AS total_atividades,
      ROUND(COALESCE(SUM(co2_kg), 0), 2) AS total_co2
    FROM atividades
  `);
  return {
    totalActivities: Number(stats.total_atividades),
    totalCo2Kg: Number(stats.total_co2),
  };
}

async function getUserStats(userId) {
  const stats = await get(
    `SELECT COUNT(*) AS total_atividades, ROUND(COALESCE(SUM(co2_kg),0),2) AS total_co2
     FROM atividades WHERE usuario_id = ?`,
    [userId]
  );
  return {
    totalActivities: Number(stats.total_atividades),
    totalCo2Kg: Number(stats.total_co2),
  };
}

app.get('/api/company', async (req, res) => {
  try {
    const company = await get('SELECT id, nome, url_logo FROM empresa WHERE id = 1');
    const userId = Number(req.query.userId || 0);
    const stats = userId ? await getUserStats(userId) : await getGlobalStats();
    res.json({
      company: {
        id: company.id,
        name: company.nome,
        logoUrl: company.url_logo,
      },
      stats,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao carregar dados da empresa.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email ou senha obrigatório' });
    }

    const user = await get('SELECT id, nome, email, url_foto FROM usuarios WHERE email = ? AND senha = ?', [
      email,
      password,
    ]);

    if (!user) {
      return res.status(401).json({ message: 'email ou senha incorreta' });
    }

    const stats = await getUserStats(user.id);

    res.json({
      user: {
        id: user.id,
        name: user.nome,
        email: user.email,
        photoUrl: user.url_foto,
      },
      stats,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro no login.' });
  }
});

app.get('/api/activities', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = 4;
    const offset = (page - 1) * limit;
    const type = req.query.type || '';
    const currentUserId = Number(req.query.currentUserId || 0);

    const where = [];
    const params = [];

    if (type) {
      where.push('a.tipo = ?');
      params.push(type);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRow = await get(`SELECT COUNT(*) AS total FROM atividades a ${whereSql}`, params);

    const rows = await all(
      `SELECT
         a.id,
         a.usuario_id,
         a.tipo,
         a.distancia_metros,
         a.duracao_minutos,
         a.co2_kg,
         a.data_criacao,
         u.nome AS nome_usuario,
         u.url_foto,
         (SELECT COUNT(*) FROM curtidas c WHERE c.atividade_id = a.id) AS total_curtidas,
         (SELECT COUNT(*) FROM comentarios c WHERE c.atividade_id = a.id) AS total_comentarios,
         (SELECT COUNT(*) FROM curtidas c2 WHERE c2.atividade_id = a.id AND c2.usuario_id = ?) AS curtida_usuario_logado
       FROM atividades a
       INNER JOIN usuarios u ON u.id = a.usuario_id
       ${whereSql}
       ORDER BY a.data_criacao DESC
       LIMIT ? OFFSET ?`,
      [currentUserId, ...params, limit, offset]
    );

    const total = Number(totalRow.total);

    res.json({
      data: rows.map(formatActivityRow),
      page,
      totalPages: Math.max(Math.ceil(total / limit), 1),
      total,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao carregar atividades.' });
  }
});

app.post('/api/activities', async (req, res) => {
  try {
    const { userId, type, distanceMeters, durationMinutes } = req.body;

    if (!userId || !type || !distanceMeters || !durationMinutes) {
      return res.status(400).json({ message: 'Campo obrigatório' });
    }

    const parsedDistance = Number(distanceMeters);
    const parsedDuration = Number(durationMinutes);

    if (parsedDistance <= 0 || parsedDuration <= 0) {
      return res.status(400).json({ message: 'Campo obrigatório' });
    }

    const co2Kg = Number(((parsedDistance / 1000) * 0.021).toFixed(2));

    const nextIdRow = await get('SELECT COALESCE(MAX(id), 0) + 1 AS proximo_id FROM atividades');
    const nextId = Number(nextIdRow.proximo_id);

    const result = await run(
      `INSERT INTO atividades (id, usuario_id, tipo, distancia_metros, duracao_minutos, co2_kg, data_criacao)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
      [nextId, userId, type, parsedDistance, parsedDuration, co2Kg, new Date()]
    );

    const created = await get(
      `SELECT
         a.id,
         a.usuario_id,
         a.tipo,
         a.distancia_metros,
         a.duracao_minutos,
         a.co2_kg,
         a.data_criacao,
         u.nome AS nome_usuario,
         u.url_foto,
         0 AS total_curtidas,
         0 AS total_comentarios,
         0 AS curtida_usuario_logado
       FROM atividades a
       JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.id = ?`,
      [result.rows[0].id]
    );

    res.status(201).json({ activity: formatActivityRow(created) });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao criar atividade.' });
  }
});

app.post('/api/activities/:id/like', async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Usuário não autenticado.' });
    }

    const existing = await get('SELECT usuario_id FROM curtidas WHERE usuario_id = ? AND atividade_id = ?', [
      userId,
      activityId,
    ]);

    if (existing) {
      await run('DELETE FROM curtidas WHERE usuario_id = ? AND atividade_id = ?', [userId, activityId]);
    } else {
      await run('INSERT INTO curtidas (usuario_id, atividade_id) VALUES (?, ?)', [userId, activityId]);
    }

    const likes = await get('SELECT COUNT(*) AS curtidas FROM curtidas WHERE atividade_id = ?', [activityId]);

    res.json({ liked: !existing, likesCount: Number(likes.curtidas) });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao curtir atividade.' });
  }
});

app.get('/api/activities/:id/comments', async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const comments = await all(
      `SELECT c.id, c.conteudo AS content, c.data_criacao AS created_at, u.nome AS user_name
       FROM comentarios c
       JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.atividade_id = ?
       ORDER BY c.data_criacao DESC`,
      [activityId]
    );

    res.json({ comments });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao listar comentários.' });
  }
});

app.post('/api/activities/:id/comments', async (req, res) => {
  try {
    const activityId = Number(req.params.id);
    const { userId, content } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'Usuário não autenticado.' });
    }

    if (!content || content.trim().length < 2) {
      return res.status(400).json({ message: 'Comentário deve ter no mínimo 2 caracteres.' });
    }

    await run('INSERT INTO comentarios (usuario_id, atividade_id, conteudo, data_criacao) VALUES (?, ?, ?, ?)', [
      userId,
      activityId,
      content.trim(),
      new Date(),
    ]);

    const count = await get('SELECT COUNT(*) AS total FROM comentarios WHERE atividade_id = ?', [activityId]);

    res.status(201).json({ commentsCount: Number(count.total) });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao comentar atividade.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`EcoMove rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Erro ao iniciar banco:', error);
    process.exit(1);
  });
