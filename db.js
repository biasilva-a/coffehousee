const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const USERS_CSV = path.join(__dirname, 'data', 'usuarios.csv');
const PRODUCTS_CSV = path.join(__dirname, 'data', 'produtos.csv');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'senai';
const DB_NAME = process.env.DB_NAME || 'coffeehouse';
const DB_ADMIN_DATABASE = process.env.DB_ADMIN_DATABASE || 'postgres';

let pool;

function parseCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const [header, ...lines] = raw.split(/\r?\n/);
  const keys = header.split(',').map((k) => k.trim());
  return lines.map((line) => {
    const values = line.split(',');
    return keys.reduce((acc, key, index) => {
      acc[key] = (values[index] || '').trim();
      return acc;
    }, {});
  });
}

function toPgQuery(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

async function run(sql, params = []) {
  return await pool.query(toPgQuery(sql), params);
}

async function all(sql, params = []) {
  const result = await pool.query(toPgQuery(sql), params);
  return result.rows;
}

async function get(sql, params = []) {
  const result = await pool.query(toPgQuery(sql), params);
  return result.rows[0];
}

async function ensureDatabaseExists() {
  const adminPool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_ADMIN_DATABASE,
  });

  try {
    const { rows } = await adminPool.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
    }
  } finally {
    await adminPool.end();
  }
}

async function initDb() {
  await ensureDatabaseExists();

  pool = new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    max: 10,
  });

  await run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL NOT NULL,
      nome VARCHAR(120) NOT NULL,
      senha VARCHAR(120) NOT NULL,
      CONSTRAINT pk_usuarios PRIMARY KEY (id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id SERIAL NOT NULL,
      nome VARCHAR(120) NOT NULL,
      categoria VARCHAR(50) NOT NULL,
      preco NUMERIC(10,2) NOT NULL,
      emoji VARCHAR(10) DEFAULT '☕',
      tempo_preparo VARCHAR(20) DEFAULT '5 min',
      CONSTRAINT pk_produtos PRIMARY KEY (id)
    )
  `);

  await run(`
  CREATE TABLE IF NOT EXISTS pedidos(
    id SERIAL PRIMARY KEY,
    produto_id VARCHAR(120) NOT NULL,
    quantidade INT NOT NULL DEFAULT 1,
    data_pedido TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_pedidos PRIMARY KEY(id),
    CONSTRAINT fk_pedidos_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_pedidos_produto FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE
  )
    `);


  await run(`
    CREATE TABLE IF NOT EXISTS avaliacoes(
      id SERIAL NOT NULL,
      usuario_id INT NOT NULL,
      produto_id INT NOT NULL,
      texto TEXT NOT NULL,
      data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT pk_comentarios PRIMARY KEY(id),
      CONSTRAINT fk_comentarios_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
      CONSTRAINT fk_comentarios_produto FOREIGN KEY(produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    )
    `);

  const usuariosCount = await get('SELECT COUNT(*) AS quantidade FROM usuarios');
  if (Number(usuariosCount.quantidade) === 0 && fs.existsSync(USERS_CSV)) {
    const usuarios = parseCsv(USERS_CSV);
    for (const usuario of usuarios) {
      await run(
        'INSERT INTO usuarios (id, nome, email, senha, url_foto) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
        [
          Number(usuario.id),
          usuario.nome,
          usuario.email,
          usuario.senha,
          usuario.foto_url || usuario.url_foto,
        ]
      );
    }
  }

  const produtosCount = await get('SELECT COUNT(*) AS quantidade FROM produtos');
  if (Number(produtosCount.quantidade) === 0 && fs.existsSync(PRODUCTS_CSV)) {
    const produtos = parseCsv(PRODUCTS_CSV);
    for (const produto of produtos) {
      await run(
        'INSERT INTO produtos (id, nome, categoria, preco, tempo_preparo, emoji) VALUES (?, ?, ?, ?, ?, ?)',
        [
          Number(produto.id),
          produto.nome,
          produto.categoria,
          Number(produto.preco),
          produto.emoji || '☕',
          produto.tempo_preparo || '5 min',
        ]
      );
    }
  }
}

module.exports = {
  run,
  get,
  all,
  initDb,
};