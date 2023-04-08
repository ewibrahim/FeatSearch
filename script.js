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

async function searchFeaturedTracks(artistName) {
  const artistNameLowerCase = artistName.toLowerCase();

  const trackSearchResults = await search(artistName, 'track', 1000);
  const albumSearchResults = await search(artistName, 'album', 1000);
  
  const allTracks = [];
  
  for (const album of albumSearchResults) {
    const albumTracks = await getAlbumTracks(album.id);
    allTracks.push(...albumTracks);
  }

  const combinedTracks = [...trackSearchResults, ...allTracks];

  const filteredTracks = combinedTracks
    .filter((track) => {
      const mainArtistNameLowerCase = track.artists[0].name.toLowerCase();
      const featuredArtists = track.artists.slice(1);
      const isExactFeaturedArtist = featuredArtists.some(
        (artist) => artist.name.toLowerCase() === artistNameLowerCase
      );

      return (
        mainArtistNameLowerCase !== artistNameLowerCase &&
        isExactFeaturedArtist
      );
    })
    .sort((a, b) => new Date(b.album.release_date) - new Date(a.album.release_date));

  return filteredTracks;
}

async function getAlbumTracks(albumId) {
  const response = await fetchWithRateLimiting(`https://api.spotify.com/v1/albums/${albumId}/tracks`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  return data.items;
}

async function fetchWithRateLimiting(url, options) {
  let response = await fetch(url, options);
  let retryAfter = 0;

  while (response.status === 429) {
    retryAfter = parseInt(response.headers.get('Retry-After')) || 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    response = await fetch(url, options);
  }

  return response;
}

async function search(query, type, limit = 50) {
  let allItems = [];
  let currentPage = 0;
  const maxItems = Math.min(limit, 1000); // Modify the maximum limit to 1000

  while (allItems.length < maxItems) {
    const currentOffset = currentPage * 50;
    const response = await fetch(
      `${searchEndpoint}?q=${encodeURIComponent(query)}&type=${type}&limit=50&offset=${currentOffset}`,
      {
        headers: {
          Authorization: 'Bearer ' + accessToken,
        },
      }
    );
    const data = await response.json();
    const items = data[type + 's'].items;

    if (items.length === 0) break; // No more items to fetch

    allItems = allItems.concat(items);
    currentPage += 1;
  }

  return allItems.slice(0, maxItems);
}

async function searchArtist(query) {
  const artists = await search(query, 'artist');
  const queryLowerCase = query.toLowerCase();

  // Look for an exact match in the list of returned artists
  const exactMatchArtist = artists.find(
    (artist) => artist.name.toLowerCase() === queryLowerCase
  );

  // If an exact match is found, return it; otherwise, return null
  return exactMatchArtist || null;
}

async function getArtistTracks(artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=US`, {
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  });
  const data = await response.json();
  return data.tracks.sort((a, b) => new Date(a.album.release_date) - new Date(b.album.release_date));
}

function displayTracks(tracks) {
  const results = $('#results');
  results.empty();

  // Remove duplicates and keep the earliest release date
  const uniqueTracks = tracks.reduce((accumulator, currentTrack) => {
    const existingTrack = accumulator.find(track => track.name === currentTrack.name);
    if (!existingTrack) {
      accumulator.push(currentTrack);
    } else {
      const currentTrackDate = new Date(currentTrack.album.release_date);
      const existingTrackDate = new Date(existingTrack.album.release_date);
      if (currentTrackDate < existingTrackDate) {
        existingTrack.album.release_date = currentTrack.album.release_date;
      }
    }
    return accumulator;
  }, []);

  uniqueTracks.forEach((track, index) => {
    const listItem = $('<li class="list-group-item"></li>');
    listItem.append(`<span>${index + 1}. ${track.artists[0].name} - ${track.name} </span>`);
    listItem.append(`<span>(${track.album.release_date})</span>`);
    results.append(listItem);
  });
}

async function performSearch(event) {
  event.preventDefault();
  const query = $('#searchQuery').val();
  if (!query) return;
  const artist = await searchArtist(query);
  if (!artist) {
    alert('Artist not found');
    return;
  }
  const tracks = await searchFeaturedTracks(artist.name);
  displayTracks(tracks);
}

(async function init() {
  await getAccessToken();
  $('#searchForm').on('submit', performSearch);
})();
