const authEndpoint = 'https://accounts.spotify.com/api/token';
const searchEndpoint = 'https://api.spotify.com/v1/search';
let accessToken = '';

async function getAccessToken() {
  const response = await fetch('https://delicate-wood-ff25.elwalid-ibr9259.workers.dev/getAccessToken', {
    method: 'GET',
  });
  const data = await response.json();
  accessToken = data.access_token;
}

async function getAlbums(artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch albums: ${response.status}`);
  }

  const data = await response.json();
  return data.items;
}

async function getAlbumTracks(albumId) {
  let response;
  let retryAfter = 0;
  do {
    if (retryAfter > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }

    response = await fetch(`https://api.spotify.com/v1/albums/${albumId}/tracks`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 429) {
      retryAfter = parseInt(response.headers.get("Retry-After")) || 1;
    }
  } while (response.status === 429);

  if (!response.ok) {
    throw new Error(`Failed to fetch album tracks: ${response.status}`);
  }

  const data = await response.json();
  return data.items;
}

async function searchArtist(artist) {
  const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artist)}&type=artist`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch artist: ${response.status}`);
  }

  const data = await response.json();
  const artists = data.artists.items;
  return artists.length > 0 ? artists[0] : null;
}

async function searchFeaturedTracks(artist) {
  const foundArtist = await searchArtist(artist);
  if (!foundArtist) {
    return [];
  }

  const albums = await getAlbums(foundArtist.id);
  const featuredTracks = [];

  for (const album of albums) {
    const albumTracks = await getAlbumTracks(album.id);
    albumTracks.forEach((track) => {
      featuredTracks.push({
        artist: track.artists[0].name,
        title: track.name,
        releaseDate: album.release_date,
      });
    });
  }

  featuredTracks.sort((a, b) => {
    if (!a.releaseDate) return 1;
    if (!b.releaseDate) return -1;
    return new Date(b.releaseDate) - new Date(a.releaseDate);
  });

  return featuredTracks;
}

async function performSearch(event) {
  event.preventDefault();
  const artist = document.getElementById("artist-input").value.trim();
  if (!artist) {
    return;
  }

  try {
    const tracks = await searchFeaturedTracks(artist);
    displayResults(tracks);
  } catch (error) {
    console.error(error);
  }
}

function displayResults(tracks) {
  const resultsElement = document.getElementById("results");
