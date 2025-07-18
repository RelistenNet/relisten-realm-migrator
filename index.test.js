import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the app from index.js
import app from './index.js';

describe('Realm Migration API', () => {
  let testDbPath;

  beforeAll(() => {
    testDbPath = join(__dirname, 'v9.realm');
  });

  it('should successfully migrate a realm database', async () => {
    // Skipping this test as the v9.realm file has format version 20 which requires upgrade
    const dbBuffer = readFileSync(testDbPath);
    const file = new File([dbBuffer], 'test.realm', { type: 'application/octet-stream' });

    const formData = new FormData();
    formData.append('database', file);

    const req = new Request('http://localhost/migrate', {
      method: 'POST',
      body: formData,
    });

    const res = await app.fetch(req);
    const data = await res.json();

    if (res.status !== 200) {
      console.log('Error response:', data);
    }

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.schemaVersion).toBeDefined();

    // Basic structure checks
    expect(data.data.artistUuids).toBeInstanceOf(Array);
    expect(data.data.showUuids).toBeInstanceOf(Array);
    expect(data.data.trackUuids).toBeInstanceOf(Array);
    expect(data.data.sources).toBeInstanceOf(Array);
    expect(data.data.offlineTracksBySource).toBeInstanceOf(Object);
  });

  it('should return error when no database file is provided', async () => {
    const formData = new FormData();

    const req = new Request('http://localhost/migrate', {
      method: 'POST',
      body: formData,
    });

    const res = await app.fetch(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Database file is required');
  });

  it('should return error for invalid database file', async () => {
    const invalidFile = new File(['invalid content'], 'test.realm', { type: 'application/octet-stream' });

    const formData = new FormData();
    formData.append('database', invalidFile);

    const req = new Request('http://localhost/migrate', {
      method: 'POST',
      body: formData,
    });

    const res = await app.fetch(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe('Unable to read database or unsupported version');
  });
});