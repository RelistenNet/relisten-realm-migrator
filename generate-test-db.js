import Realm from 'realm';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function generateTestDatabase() {
  const timestamp = Date.now();
  const testDbPath = join(__dirname, `test-realm-v9-${timestamp}.realm`);

  const realm = new Realm({
    path: testDbPath,
    schema: [
      FavoritedArtistSchema,
      FavoritedShowSchema,
      FavoritedSourceSchema,
      FavoritedTrackSchema,
      OfflineTrackSchema,
    ],
    schemaVersion: 9,
  });

  realm.write(() => {
    const now = new Date();
    const showDate = new Date('2023-07-15');

    const artist = realm.create('FavoritedArtist', {
      uuid: 'artist-123',
      created_at: now,
    });

    const show = realm.create('FavoritedShow', {
      uuid: 'show-456',
      created_at: now,
      show_date: showDate,
      artist_uuid: 'artist-123',
    });

    const source = realm.create('FavoritedSource', {
      uuid: 'source-789',
      created_at: now,
      artist_uuid: 'artist-123',
      show_uuid: 'show-456',
      show_date: showDate,
    });

    const track = realm.create('FavoritedTrack', {
      uuid: 'track-101',
      created_at: now,
      artist_uuid: 'artist-123',
      show_uuid: 'show-456',
      source_uuid: 'source-789',
    });

    const offlineTrack = realm.create('OfflineTrack', {
      track_uuid: 'offline-track-202',
      artist_uuid: 'artist-123',
      show_uuid: 'show-456',
      source_uuid: 'source-789',
      created_at: now,
      state: OfflineTrackState.DOWNLOADED,
      file_size: 5242880,
    });
  });

  realm.close();
  console.log(`Test database created at: ${testDbPath}`);
  return testDbPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateTestDatabase();
}

export { generateTestDatabase };