const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TOP_N = 20;

interface Movie {
    id: number;
    title: string;
    poster_path: string;
}

interface TVShow {
    id: number;
    name: string;
    poster_path: string;
}

async function fetchTopMovies(): Promise<Movie[]> {
    const response = await fetch(`/streamapi/movie/popular?language=en-US&page=1`);
    const data = await response.json();
    return data.results.slice(0, TOP_N);
}

async function fetchTopTVShows(): Promise<TVShow[]> {
    const response = await fetch(`/streamapi/tv/popular?language=en-US&page=1`);
    const data = await response.json();
    return data.results.slice(0, TOP_N);
}

async function searchContent(query: string): Promise<(Movie | TVShow)[]> {
    const response = await fetch(`/streamapi/search/multi?language=en-US&query=${encodeURIComponent(query)}&page=1`);
    const data = await response.json();
    return data.results.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
}

function createMovieCard(movie: Movie): string {
    const imageUrl = movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : '/img/place2.png';
    return `
        <div class="show-card glass cursor-pointer transform transition-transform" data-link="/player?type=movie&id=${movie.id}">
            <img 
                src="${imageUrl}" 
                alt="${movie.title} poster" 
                class="game-image"
            >
            <h3 class="text-white font-medium text-xl">${movie.title}</h3>
        </div>
    `;
}

function createTVCard(show: TVShow): string {
    const imageUrl = show.poster_path ? `${TMDB_IMAGE_BASE}${show.poster_path}` : '/img/place2.png';
    return `
        <div class="show-card glass cursor-pointer transform transition-transform" data-tv-id="${show.id}">
            <img 
                src="${imageUrl}" 
                alt="${show.name} poster" 
                class="game-image"
            >
            <h3 class="text-white font-medium text-xl">${show.name}</h3>
        </div>
    `;
}

function createSearchResultCard(item: any): string {
    const title = item.title || item.name;
    const imageUrl = item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : '/img/place2.png';
    const dataAttr = item.media_type === 'tv' ? `data-tv-id="${item.id}"` : `data-link="/player?type=movie&id=${item.id}"`;
    return `
        <div class="show-card glass cursor-pointer transform transition-transform" ${dataAttr}>
            <img 
                src="${imageUrl}" 
                alt="${title} poster" 
                class="game-image"
            >
            <h3 class="text-white font-medium text-xl">${title}</h3>
        </div>
    `;
}

async function loadStreaming() {
    const moviesContainer = document.getElementById('top-movies');
    const tvContainer = document.getElementById('top-tv');

    if (!moviesContainer || !tvContainer) return;

    try {
        const [movies, tvShows] = await Promise.all([fetchTopMovies(), fetchTopTVShows()]);

        moviesContainer.innerHTML = movies.map(movie => createMovieCard(movie)).join('');
        tvContainer.innerHTML = tvShows.map(show => createTVCard(show)).join('');

        attachCardListeners();
    } catch (error) {
        console.error('Error loading streaming content:', error);
        moviesContainer.innerHTML = '<p class="text-white text-center">Error loading movies</p>';
        tvContainer.innerHTML = '<p class="text-white text-center">Error loading TV shows</p>';
    }
}

async function showTVModal(tvId: number) {
    const modal = document.createElement('div');
    modal.id = 'tv-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="glass w-11/12 max-w-6xl h-5/6 rounded-2xl flex flex-col">
            <div class="flex justify-between items-center p-4 border-b border-gray-600">
                <h2 class="text-white text-2xl font-bold">Select Season & Episode</h2>
                <button id="close-tv-modal" class="text-white text-3xl hover:text-red-500">&times;</button>
            </div>
            <div id="tv-modal-content" class="flex-1 overflow-y-auto p-4">
                <div class="flex justify-center items-center h-full">
                    <div class="loader"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-tv-modal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    try {
        const response = await fetch(`/streamapi/tv/${tvId}?language=en-US`);
        const data = await response.json();
        const content = document.getElementById('tv-modal-content');
        if (!content) return;

        content.innerHTML = `
            <div class="mb-4">
                <label class="text-white text-lg font-semibold">Season:</label>
                <select id="season-select" class="ml-2 p-2 rounded bg-gray-800 text-white">
                    ${data.seasons.filter((s: any) => s.season_number > 0).map((s: any) =>
            `<option value="${s.season_number}">Season ${s.season_number}</option>`
        ).join('')}
                </select>
            </div>
            <div id="episodes-container" class="grid-container"></div>
        `;

        const seasonSelect = document.getElementById('season-select') as HTMLSelectElement;
        const loadEpisodes = async (season: number) => {
            const episodesContainer = document.getElementById('episodes-container');
            if (!episodesContainer) return;
            episodesContainer.innerHTML = '<div class="flex justify-center"><div class="loader"></div></div>';

            const epResponse = await fetch(`/streamapi/tv/${tvId}/season/${season}?language=en-US`);
            const epData = await epResponse.json();

            episodesContainer.innerHTML = epData.episodes.map((ep: any) => {
                const imgUrl = ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : '/img/place2.png';
                return `
                    <div class="game-card glass cursor-pointer" data-episode-link="/player?type=tv&id=${tvId}&s=${season}&e=${ep.episode_number}">
                        <img src="${imgUrl}" alt="${ep.name}" class="game-image">
                        <h3 class="text-white font-medium text-lg">E${ep.episode_number}: ${ep.name}</h3>
                    </div>
                `;
            }).join('');

            episodesContainer.querySelectorAll('[data-episode-link]').forEach(card => {
                card.addEventListener('click', () => {
                    window.location.href = card.getAttribute('data-episode-link')!;
                });
            });
        };

        seasonSelect.addEventListener('change', () => loadEpisodes(parseInt(seasonSelect.value)));
        loadEpisodes(parseInt(seasonSelect.value));
    } catch (error) {
        console.error('Error loading TV show:', error);
    }
}

function attachCardListeners() {
    document.querySelectorAll('.show-card').forEach(card => {
        card.addEventListener('click', () => {
            const tvId = card.getAttribute('data-tv-id');
            const link = card.getAttribute('data-link');
            if (tvId) showTVModal(parseInt(tvId));
            else if (link) window.location.href = link;
        });
    });
}

function showSearchModal() {
    const modal = document.createElement('div');
    modal.id = 'search-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="glass w-11/12 max-w-6xl h-5/6 rounded-2xl flex flex-col">
            <div class="flex justify-between items-center p-4 border-b border-gray-600">
                <h2 class="text-white text-2xl font-bold">Search Results</h2>
                  <h2 class="text-red-500 text-2xl font-bold">WARNING: Some films here may be inaccurate. Our site displays films that haven't been released yet, so they will error on load.</h2>
                <button id="close-modal" class="text-white text-3xl hover:text-red-500">&times;</button>
            </div>
            <div id="search-results-content" class="flex-1 overflow-y-auto p-4">
                <div class="flex justify-center items-center h-full">
                    <div class="loader"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-modal')?.addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

async function handleSearch() {
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const query = searchInput?.value.trim();

    if (!query) return;

    showSearchModal();

    try {
        const results = await searchContent(query);
        const resultsContainer = document.getElementById('search-results-content');

        if (resultsContainer) {
            if (results.length === 0) {
                resultsContainer.innerHTML = '<p class="text-white text-center text-xl">No results found</p>';
            } else {
                resultsContainer.innerHTML = `<div class="grid-container">${results.map(item => createSearchResultCard(item)).join('')}</div>`;
                attachCardListeners();
            }
        }
    } catch (error) {
        const resultsContainer = document.getElementById('search-results-content');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<p class="text-white text-center text-xl">Error loading results</p>';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadStreaming();

    document.getElementById('s')?.addEventListener('click', handleSearch);
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
});
