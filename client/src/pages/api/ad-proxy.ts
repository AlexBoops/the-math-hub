import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const AD_SCRIPT_URL = 'https://thieflamppost.com/0b4f29943f8825bf9a2e81a67765af8b/invoke.js';

    try {
        // Fetch the ad script from the original source
        const response = await fetch(AD_SCRIPT_URL, {
            headers: {
                'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
                'Accept': '*/*',
            },
        });

        if (!response.ok) {
            return new Response(`Failed to fetch ad script: ${response.status}`, {
                status: response.status,
                statusText: response.statusText,
            });
        }

        const script = await response.text();

        // Return the script with appropriate headers
        return new Response(script, {
            status: 200,
            headers: {
                'Content-Type': 'application/javascript; charset=utf-8',
                'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
                'Access-Control-Allow-Origin': '*',
                'X-Proxied-By': 'ad-proxy',
            },
        });
    } catch (error) {
        console.error('Ad proxy error:', error);
        return new Response(`Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
            status: 500,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    }
};
