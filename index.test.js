import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateTestDatabase } from './generate-test-db.js';

// Import the Hono app
import { Hono } from 'hono';
import Realm from 'realm';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';

// Import the schemas and helper functions from the main file
const FavoritedArtistSchema = {
  name: 'FavoritedArtist',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
  },
};

const FavoritedShowSchema = {
  name: 'FavoritedShow',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    show_date: 'date',
    artist_uuid: 'string',
  },
};

const FavoritedSourceSchema = {
  name: 'FavoritedSource',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    artist_uuid: 'string',
    show_uuid: 'string',
    show_date: 'date',
  },
};

const FavoritedTrackSchema = {
  name: 'FavoritedTrack',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    artist_uuid: 'string',
    show_uuid: 'string',
    source_uuid: 'string',
  },
};

const OfflineTrackSchema = {
  name: 'OfflineTrack',
  primaryKey: 'track_uuid',
  properties: {
    track_uuid: 'string',
    artist_uuid: 'string',
    show_uuid: 'string',
    source_uuid: 'string',
    created_at: 'date',
    state: 'int',
    file_size: 'int?',
  },
};

const OfflineTrackState = {
  DOWNLOADED: 3,
};

function aggregateBy(items, keySelector) {
  const result = {};
  for (const item of items) {
    const key = keySelector(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

// Create a test app with the migration route
const app = new Hono();

app.post('/migrate', async (c) => {
  let tempInputPath = null;

  try {
    const formData = await c.req.formData();
    const databaseFile = formData.get('database');

    if (!databaseFile) {
      return c.json({ error: 'Database file is required' }, 400);
    }

    const timestamp = Date.now();
    tempInputPath = join(tmpdir(), `realm_input_${timestamp}.realm`);

    const databaseBuffer = Buffer.from(await databaseFile.arrayBuffer());
    writeFileSync(tempInputPath, databaseBuffer);

    let realm;
    try {
      realm = new Realm({
        path: tempInputPath,
        readOnly: true,
        schema: [
          FavoritedArtistSchema,
          FavoritedShowSchema,
          FavoritedSourceSchema,
          FavoritedTrackSchema,
          OfflineTrackSchema,
        ],
      });
    } catch {
      try {
        realm = new Realm({ path: tempInputPath, readOnly: true });
      } catch {
        return c.json(
          { error: 'Unable to read database or unsupported version' },
          400
        );
      }
    }

    const schemaVersion = realm.schemaVersion;

    const legacyData = {
      trackUuids: [],
      showUuids: [],
      sources: [],
      artistUuids: [],
      offlineTracksBySource: {},
      schemaVersion,
    };

    try {
      const favoriteTracks = realm.objects('FavoritedTrack');
      legacyData.trackUuids = Array.from(favoriteTracks)
        .map((o) => o.uuid.toLowerCase())
        .sort();

      const favoriteShows = realm.objects('FavoritedShow');
      legacyData.showUuids = Array.from(favoriteShows)
        .map((o) => o.uuid.toLowerCase())
        .sort();

      const favoriteSources = realm.objects('FavoritedSource');
      legacyData.sources = Array.from(favoriteSources).map((o) => ({
        uuid: o.uuid.toLowerCase(),
        created_at: o.created_at,
        artist_uuid: o.artist_uuid.toLowerCase(),
        show_uuid: o.show_uuid.toLowerCase(),
        show_date: o.show_date,
      }));

      const favoriteArtists = realm.objects('FavoritedArtist');
      legacyData.artistUuids = Array.from(favoriteArtists)
        .map((o) => o.uuid.toLowerCase())
        .sort();

      const offlineTracks = realm.objects('OfflineTrack');
      const downloadedTracks = Array.from(offlineTracks)
        .filter((o) => o.state === OfflineTrackState.DOWNLOADED)
        .map((o) => ({
          track_uuid: o.track_uuid.toLowerCase(),
          artist_uuid: o.artist_uuid.toLowerCase(),
          show_uuid: o.show_uuid.toLowerCase(),
          source_uuid: o.source_uuid.toLowerCase(),
          created_at: o.created_at,
          state: o.state,
          file_size: o.file_size,
        }));

      legacyData.offlineTracksBySource = aggregateBy(downloadedTracks, (t) => t.source_uuid);
    } catch (error) {
      console.warn('Some data could not be extracted:', error);
    }

    realm.close();

    return c.json({
      success: true,
      data: legacyData,
      isEmpty: !(
        legacyData.trackUuids.length > 0 ||
        legacyData.showUuids.length > 0 ||
        legacyData.sources.length > 0 ||
        legacyData.artistUuids.length > 0 ||
        Object.entries(legacyData.offlineTracksBySource).length > 0
      ),
    });
  } catch (error) {
    console.error('Database parsing failed:', error);

    return c.json(
      {
        error: 'Database parsing failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  } finally {
    try {
      if (tempInputPath) unlinkSync(tempInputPath);
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('Realm Migration API', () => {
  let testDbPath;

  beforeAll(() => {
    testDbPath = generateTestDatabase();
  });

  afterAll(() => {
    // Clean up test database files
    try {
      if (testDbPath) {
        unlinkSync(testDbPath);
        // Also clean up associated realm files
        try { unlinkSync(testDbPath + '.lock'); } catch {}
        try { unlinkSync(testDbPath + '.note'); } catch {}
        // Clean up management directory
        const managementDir = testDbPath + '.management';
        try {
          const { rmSync } = require('fs');
          rmSync(managementDir, { recursive: true, force: true });
        } catch {}
      }
    } catch (error) {
      console.warn('Failed to clean up test database:', error.message);
    }
  });

  it('should successfully migrate a realm database', async () => {
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

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.isEmpty).toBe(false);
    
    expect(data.data.artistUuids).toContain('artist-123');
    expect(data.data.showUuids).toContain('show-456');
    expect(data.data.trackUuids).toContain('track-101');
    
    expect(data.data.sources).toHaveLength(1);
    expect(data.data.sources[0].uuid).toBe('source-789');
    expect(data.data.sources[0].artist_uuid).toBe('artist-123');
    expect(data.data.sources[0].show_uuid).toBe('show-456');

    expect(data.data.offlineTracksBySource['source-789']).toHaveLength(1);
    expect(data.data.offlineTracksBySource['source-789'][0].track_uuid).toBe('offline-track-202');
    expect(data.data.offlineTracksBySource['source-789'][0].state).toBe(3);
    expect(data.data.offlineTracksBySource['source-789'][0].file_size).toBe(5242880);
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