const http = require('http');
const fs = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');
const STATUS = ['Diterima', 'Dicuci', 'Disetrika', 'Siap Diambil', 'Selesai'];

// shortcut: satu file JSON sebagai database, ganti ke SQL (template dosen) bila data besar atau akses bersamaan banyak
if (!fs.existsSync(DB_FILE)) fs.copyFileSync(path.join(__dirname, 'seed.json'), DB_FILE);
const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const nextId = (list) => list.reduce((m, r) => Math.max(m, r.id), 0) + 1;

class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const bad = (m) => new HttpError(400, m);

const text = (v, label, { required = true, max = 100 } = {}) => {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw bad(`${label} wajib diisi`);
    return '';
  }
  const s = String(v).trim();
  if (s.length > max) throw bad(`${label} maksimal ${max} karakter`);
  return s;
};
const num = (v, label, { min = 0, integer = false } = {}) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n) || n < min)
    throw bad(`${label} harus berupa angka minimal ${min}`);
  if (integer && !Number.isInteger(n)) throw bad(`${label} harus bilangan bulat`);
  return n;
};

const validators = {
  pelanggan: (b) => ({
    nama: text(b.nama, 'Nama'),
    telepon: text(b.telepon, 'Telepon', { max: 20 }),
    alamat: text(b.alamat, 'Alamat', { required: false, max: 200 }),
  }),
  layanan: (b) => ({
    nama: text(b.nama, 'Nama layanan'),
    harga_per_kg: num(b.harga_per_kg, 'Harga per kg', { min: 1, integer: true }),
    estimasi_hari: num(b.estimasi_hari, 'Estimasi hari', { min: 1, integer: true }),
    deskripsi: text(b.deskripsi, 'Deskripsi', { required: false, max: 200 }),
  }),
};

const find = (table, id) => {
  const row = db[table].find((r) => r.id === Number(id));
  if (!row) throw new HttpError(404, `Data ${table} dengan id ${id} tidak ditemukan`);
  return row;
};

const view = (p) => ({
  ...p,
  pelanggan_nama: db.pelanggan.find((x) => x.id === p.pelanggan_id)?.nama ?? null,
  layanan_nama: db.layanan.find((x) => x.id === p.layanan_id)?.nama ?? null,
});

const buildPesanan = (b, old = {}) => {
  const merged = { ...old, ...b };
  const pelanggan = find('pelanggan', merged.pelanggan_id);
  const layanan = find('layanan', merged.layanan_id);
  const berat = num(merged.berat_kg, 'Berat (kg)', { min: 0.1 });
  const status = merged.status ?? 'Diterima';
  if (!STATUS.includes(status)) throw bad(`Status harus salah satu dari: ${STATUS.join(', ')}`);
  return {
    pelanggan_id: pelanggan.id,
    layanan_id: layanan.id,
    berat_kg: berat,
    total_harga: Math.round(berat * layanan.harga_per_kg),
    status,
    tanggal_masuk: merged.tanggal_masuk || new Date().toISOString().slice(0, 10),
    catatan: text(merged.catatan, 'Catatan', { required: false, max: 200 }),
  };
};

// Setiap handler menerima ({ params, query, body }) dan mengembalikan [kode, data, pesan?]
const routes = [];
const route = (method, pattern, handler) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

route('GET', '/api/health', () => [200, { status: 'ok' }]);

route('GET', '/api/dashboard', () => [200, {
  total_pesanan: db.pesanan.length,
  total_pendapatan: db.pesanan.reduce((t, p) => t + p.total_harga, 0),
  per_status: Object.fromEntries(STATUS.map((s) => [s, db.pesanan.filter((p) => p.status === s).length])),
}]);

// CRUD pelanggan dan layanan
for (const table of ['pelanggan', 'layanan']) {
  const base = `/api/${table}`;
  const usedBy = table === 'pelanggan' ? 'pelanggan_id' : 'layanan_id';
  route('GET', base, ({ query }) => {
    const q = String(query.get('q') || '').toLowerCase();
    return [200, db[table].filter((r) => !q || r.nama.toLowerCase().includes(q))];
  });
  route('GET', `${base}/:id`, ({ params }) => [200, find(table, params.id)]);
  route('POST', base, ({ body }) => {
    const row = { id: nextId(db[table]), ...validators[table](body) };
    db[table].push(row);
    save();
    return [201, row, `${table} berhasil ditambahkan`];
  });
  route('PUT', `${base}/:id`, ({ params, body }) => {
    const row = find(table, params.id);
    Object.assign(row, validators[table]({ ...row, ...body }));
    save();
    return [200, row, `${table} berhasil diperbarui`];
  });
  route('DELETE', `${base}/:id`, ({ params }) => {
    const row = find(table, params.id);
    if (db.pesanan.some((p) => p[usedBy] === row.id))
      throw new HttpError(409, 'Tidak dapat dihapus karena masih dipakai oleh pesanan');
    db[table].splice(db[table].indexOf(row), 1);
    save();
    return [200, row, `${table} berhasil dihapus`];
  });
}

// CRUD pesanan
route('GET', '/api/pesanan', ({ query }) => {
  const status = query.get('status'), pid = query.get('pelanggan_id'), q = query.get('q');
  let list = db.pesanan.map(view);
  if (status) list = list.filter((p) => p.status === status);
  if (pid) list = list.filter((p) => p.pelanggan_id === Number(pid));
  if (q) list = list.filter((p) => `${p.kode} ${p.pelanggan_nama}`.toLowerCase().includes(q.toLowerCase()));
  return [200, list.sort((a, b) => b.id - a.id)];
});
route('GET', '/api/pesanan/:id', ({ params }) => [200, view(find('pesanan', params.id))]);
route('POST', '/api/pesanan', ({ body }) => {
  const id = nextId(db.pesanan);
  const row = { id, kode: `LDR-${String(id).padStart(4, '0')}`, ...buildPesanan(body) };
  db.pesanan.push(row);
  save();
  return [201, view(row), 'pesanan berhasil ditambahkan'];
});
route('PUT', '/api/pesanan/:id', ({ params, body }) => {
  const row = find('pesanan', params.id);
  Object.assign(row, buildPesanan(body, row));
  save();
  return [200, view(row), 'pesanan berhasil diperbarui'];
});
route('PATCH', '/api/pesanan/:id/status', ({ params, body }) => {
  const row = find('pesanan', params.id);
  if (!STATUS.includes(body.status)) throw bad(`Status harus salah satu dari: ${STATUS.join(', ')}`);
  row.status = body.status;
  save();
  return [200, view(row), 'status pesanan diperbarui'];
});
route('DELETE', '/api/pesanan/:id', ({ params }) => {
  const row = find('pesanan', params.id);
  db.pesanan.splice(db.pesanan.indexOf(row), 1);
  save();
  return [200, view(row), 'pesanan berhasil dihapus'];
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const send = (res, code, payload) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(payload));
};

const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
    if (raw.length > 1e6) { reject(new HttpError(413, 'Body terlalu besar')); req.destroy(); }
  });
  req.on('end', () => {
    if (!raw) return resolve({});
    try { resolve(JSON.parse(raw)); } catch { reject(bad('Body bukan JSON yang valid')); }
  });
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const matched = routes.filter((r) => r.re.test(pathname));
    const r = matched.find((x) => x.method === req.method);
    if (!r) {
      if (matched.length) throw new HttpError(405, 'Method tidak diizinkan untuk endpoint ini');
      throw new HttpError(404, 'Endpoint tidak ditemukan');
    }
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw bad('Body harus berupa objek JSON');
    const [code, data, message] = r.handler({ params: r.re.exec(pathname).groups ?? {}, query: url.searchParams, body });
    send(res, code, { success: true, message, data });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { success: false, message: e.message });
    console.error(e);
    send(res, 500, { success: false, message: 'Terjadi kesalahan pada server' });
  }
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`Laundry API berjalan di http://localhost:${port}`));
}
module.exports = { server };
