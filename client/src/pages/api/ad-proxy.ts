import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
    const AD_SCRIPT_URL = 'https://thieflamppost.com/0b4f29943f8825bf9a2e81a67765af8b/invoke.js';

    try {
        // Get the origin from the request or use a default
        const origin = request.headers.get('origin') || 'https://mathclass.404.mn';

        // Fetch the ad script from the original source with browser-like headers
        const response = await fetch(AD_SCRIPT_URL, {
            headers: {
                'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': origin,
                'Origin': origin,
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'script',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site',
            },
        });

        if (!response.ok) {
            console.error(`Ad proxy fetch failed: ${response.status} ${response.statusText}`);
            return new Response(`Failed to fetch ad script: ${response.status} ${response.statusText}`, {
                status: response.status,
                statusText: response.statusText,
                headers: {
                    'Content-Type': 'text/plain',
                },
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
