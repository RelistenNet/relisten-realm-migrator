import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import Realm from 'realm';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const app = new Hono();

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

const RecentlyPlayedTrackSchema = {
  name: 'RecentlyPlayedTrack',
  primaryKey: 'uuid',
  properties: {
    uuid: 'string',
    created_at: 'date',
    artist_uuid: 'string',
    show_uuid: 'string',
    source_uuid: 'string',
    track_uuid: 'string',
    updated_at: 'date',
    past_halfway: 'bool',
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

const OfflineSourceSchema = {
  name: 'OfflineSource',
  primaryKey: 'source_uuid',
  properties: {
    source_uuid: 'string',
    artist_uuid: 'string',
    show_uuid: 'string',
    year_uuid: 'string',
    created_at: 'date',
  },
};

const OfflineTrackState = {
  UNKNOWN: 0,
  DOWNLOAD_QUEUED: 1,
  DOWNLOADING: 2,
  DOWNLOADED: 3,
  DELETING: 4,
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
          RecentlyPlayedTrackSchema,
          OfflineTrackSchema,
          OfflineSourceSchema,
        ],
      });
    } catch {
      try {
        realm = new Realm({ path: tempInputPath, readOnly: true });
      } catch (err) {
        console.error(err)
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

const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});

export default app;