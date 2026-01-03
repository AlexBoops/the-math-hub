import type { APIRoute } from 'astro';

const TMDB_API_KEY = 'ca53aa13ab3965a3539b02d893865f94';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export const GET: APIRoute = async ({ params, request }) => {
    const path = params.path || '';
    const url = new URL(request.url);
    const queryString = url.search;

    // Build the TMDB URL
    let tmdbUrl = `${TMDB_BASE_URL}/${path}`;

    // Append the API key to existing query params or create new ones
    if (queryString) {
        tmdbUrl += `${queryString}&api_key=${TMDB_API_KEY}`;
    } else {
        tmdbUrl += `?api_key=${TMDB_API_KEY}`;
    }

    try {
        const response = await fetch(tmdbUrl, {
            headers: {
                'Accept': 'application/json',
            },
        });

        const data = await response.json();

        return new Response(JSON.stringify(data), {
            status: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('TMDB Proxy Error:', error);
        return new Response(JSON.stringify({ error: 'Failed to fetch from TMDB' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
};
