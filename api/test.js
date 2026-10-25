// Self-check CRUD: jalankan `npm test`. Memakai database sementara, bukan data.json.
const os = require('os');
const path = require('path');
process.env.DB_FILE = path.join(os.tmpdir(), `laundry-test-${Date.now()}.json`);
const assert = require('assert');
const { server } = require('./server');

server.listen(0, async () => {
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json() };
  };
  try {
    let r = await call('GET', '/pesanan');
    assert.equal(r.status, 200);
    assert.equal(r.json.data.length, 3);

    r = await call('POST', '/pesanan', { pelanggan_id: 1, layanan_id: 2, berat_kg: 2.5 });
    assert.equal(r.status, 201);
    assert.equal(r.json.data.total_harga, 20000); // 2.5 kg x 8000
    assert.equal(r.json.data.status, 'Diterima');
    const id = r.json.data.id;

    r = await call('PATCH', `/pesanan/${id}/status`, { status: 'Selesai' });
    assert.equal(r.json.data.status, 'Selesai');

    r = await call('PATCH', `/pesanan/${id}/status`, { status: 'Hilang' });
    assert.equal(r.status, 400);

    r = await call('PUT', `/pesanan/${id}`, { berat_kg: 4 });
    assert.equal(r.json.data.total_harga, 32000);

    r = await call('POST', '/pesanan', { pelanggan_id: 99, layanan_id: 1, berat_kg: 1 });
    assert.equal(r.status, 404);

    r = await call('POST', '/pelanggan', { nama: '', telepon: '1' });
    assert.equal(r.status, 400);

    r = await call('DELETE', '/pelanggan/1');
    assert.equal(r.status, 409); // masih punya pesanan

    r = await call('DELETE', `/pesanan/${id}`);
    assert.equal(r.status, 200);
    r = await call('GET', `/pesanan/${id}`);
    assert.equal(r.status, 404);

    r = await call('POST', '/pelanggan', { nama: 'Tes', telepon: '0812' });
    assert.equal(r.status, 201);
    r = await call('DELETE', `/pelanggan/${r.json.data.id}`);
    assert.equal(r.status, 200);

    r = await call('GET', '/dashboard');
    assert.equal(r.json.data.total_pesanan, 3);
    console.log('Semua pengujian API lulus');
  } catch (e) {
    console.error('GAGAL:', e.message);
    process.exitCode = 1;
  } finally {
    server.close();
    require('fs').rmSync(process.env.DB_FILE, { force: true });
  }
});
