/**
 * Vidfast Reverse Proxy Middleware
 * 
 * Proxies vidfast.pro through /video/* with full content rewriting
 * so the browser never sees the original domain.
 */

const TARGET_HOST = 'vidfast.pro';
const TARGET_ORIGIN = `https://${TARGET_HOST}`;
const PROXY_PATH = '/video';

// Content types that need URL rewriting
const REWRITABLE_TYPES = [
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'application/json',
];

const INTERCEPTOR_SCRIPT = `
<script>
(function() {
    console.log('[Vidfast Proxy] Initializing interceptor...');
    const PROXY_BASE = '/video/ext/';
    
    function rewriteUrl(url) {
        if (!url) return url;
        if (typeof url !== 'string') url = url.toString();
        // Don't rewrite if already proxied or local
        // We use window.location.origin to check for absolute local URLs
        if (url.startsWith('/video/') || url.startsWith(window.location.origin + '/video/')) return url;
        if (url.startsWith('/') && !url.startsWith('//')) return url; // Start with / but not //
        
        let target = url;
        if (url.startsWith('//')) {
            target = 'https:' + url;
        } else if (!url.startsWith('http')) {
            return url; // Relative path or other protocol
        }
        
        // At this point target starts with http:// or https://
        // Check if it's external (not our origin)
        if (target.startsWith(window.location.origin)) return url;

        // Convert https://domain.com/path -> /video/ext/https/domain.com/path
        return PROXY_BASE + target.replace('://', '/');
    }

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let newInput = input;
        if (typeof input === 'string') {
            newInput = rewriteUrl(input);
        } else if (input instanceof Request) {
            newInput = new Request(rewriteUrl(input.url), input);
        }
        return originalFetch(newInput, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        return originalOpen.call(this, method, rewriteUrl(url), ...args);
    };
    console.log('[Vidfast Proxy] Interceptor active');
})();
</script>
`;

/**
 * Check if a content type needs rewriting
 */
function needsRewriting(contentType: string | null): boolean {
    if (!contentType) return false;
    return REWRITABLE_TYPES.some(type => contentType.includes(type));
}

/**
 * Rewrite URLs in content - replaces vidfast.pro references with proxy path
 */
function rewriteContent(content: string, contentType: string | null, proxyBase: string): string {
    let rewritten = content;

    // Rewrite absolute URLs to the target
    rewritten = rewritten.replace(
        new RegExp(`https?://${TARGET_HOST}`, 'gi'),
        proxyBase
    );

    // Rewrite protocol-relative URLs
    rewritten = rewritten.replace(
        new RegExp(`//${TARGET_HOST}`, 'gi'),
        proxyBase.replace(/^https?:/, '')
    );

    // For HTML content, rewrite root-relative paths in specific attributes
    if (contentType?.includes('text/html')) {
        // Rewrite src, href, action attributes that start with /
        // Matches: src="/path", href='/path', action="/path", etc.
        // Negative lookahead (?!(?:video\/|_next\/image)) prevents double prefixing or breaking specific paths
        rewritten = rewritten.replace(
            /((?:src|href|action|srcset|poster|data-src|data-href)\s*=\s*["'])\/(?!video\/)([^"']*["'])/gi,
            `$1${PROXY_PATH}/$2`
        );

        // Rewrite Next.js specific patterns and other root paths in double quotes
        rewritten = rewritten.replace(
            /"(\/(?:_next|api|cdn-cgi|hezushon)\/[^"]*)"/g,
            `"${PROXY_PATH}$1"`
        );

        // Rewrite Next.js specific patterns in single quotes
        rewritten = rewritten.replace(
            /'(\/(?:_next|api|cdn-cgi|hezushon)\/[^']*)'/g,
            `'${PROXY_PATH}$1'`
        );

        // Rewrite preload/prefetch links that might have been missed
        rewritten = rewritten.replace(
            /(rel=["'](?:preload|prefetch|modulepreload)["'][^>]*href=["'])\/(?!video\/)([^"']+["'])/gi,
            `$1${PROXY_PATH}/$2`
        );

        // Also catch reversed order (href before rel)
        rewritten = rewritten.replace(
            /(href=["'])\/(?!video\/)([^"']+["'][^>]*rel=["'](?:preload|prefetch|modulepreload)["'])/gi,
            `$1${PROXY_PATH}/$2`
        );

        // Rewrite inline script content that has root paths
        rewritten = rewritten.replace(
            /(<script[^>]*>)([\s\S]*?)(<\/script>)/gi,
            (match, openTag, content, closeTag) => {
                let rewrittenContent = content;
                // Rewrite paths in the script content
                rewrittenContent = rewrittenContent.replace(
                    /"(\/(?:_next|api|cdn-cgi|hezushon)\/[^"]*)"/g,
                    `"${PROXY_PATH}$1"`
                );
                rewrittenContent = rewrittenContent.replace(
                    /'(\/(?:_next|api|cdn-cgi|hezushon)\/[^']*)'/g,
                    `'${PROXY_PATH}$1'`
                );
                return openTag + rewrittenContent + closeTag;
            }
        );

        // Inject interceptor script in head
        rewritten = rewritten.replace('</head>', INTERCEPTOR_SCRIPT + '</head>');
    }

    // For JavaScript content
    if (contentType?.includes('javascript')) {
        // Rewrite string literals with absolute paths
        // Be careful not to break the JS - only rewrite known patterns

        // Next.js chunk loading paths, API routes, and other specific root paths
        const targets = ['_next', 'api', 'cdn-cgi', 'hezushon'];
        const pattern = targets.join('|');

        // Replace "/_next/..." with "/video/_next/..."
        rewritten = rewritten.replace(
            new RegExp(`"\\/(${pattern})\\/`, 'g'),
            `"${PROXY_PATH}/$1/`
        );

        // Single-quoted variants
        rewritten = rewritten.replace(
            new RegExp(`'\\/(${pattern})\\/`, 'g'),
            `'${PROXY_PATH}/$1/`
        );

        // Template literal variants (backticks)
        rewritten = rewritten.replace(
            new RegExp(`\`\\/(${pattern})\\/`, 'g'),
            `\`${PROXY_PATH}/$1/`
        );
    }

    // For CSS content
    if (contentType?.includes('text/css')) {
        // Rewrite url() references
        rewritten = rewritten.replace(
            /url\(\s*["']?\/([^"')]+)["']?\s*\)/gi,
            `url("${PROXY_PATH}/$1")`
        );
    }

    // For JSON content (Next.js data fetching)
    if (contentType?.includes('application/json')) {
        // Rewrite any absolute URLs in JSON
        rewritten = rewritten.replace(
            new RegExp(`"https?://${TARGET_HOST}`, 'gi'),
            `"${proxyBase}`
        );
    }

    return rewritten;
}

/**
 * Rewrite Set-Cookie headers to work on our domain
 */
function rewriteCookieHeader(cookie: string): string {
    // Remove or rewrite domain attribute
    let rewritten = cookie.replace(/;\s*domain=[^;]*/gi, '');

    // Rewrite path if it's root
    rewritten = rewritten.replace(/;\s*path=\//gi, `; Path=${PROXY_PATH}/`);

    // Remove SameSite=None if we're not using HTTPS in dev
    // (this is handled by the browser anyway)

    return rewritten;
}

/**
 * Create headers for the proxied request
 */
function createProxyHeaders(originalRequest: Request, targetUrl: URL): Headers {
    const headers = new Headers();

    // Copy most headers from original request
    for (const [key, value] of originalRequest.headers.entries()) {
        const lowerKey = key.toLowerCase();

        // Skip hop-by-hop headers and host
        if (['host', 'connection', 'keep-alive', 'transfer-encoding',
            'te', 'trailer', 'upgrade'].includes(lowerKey)) {
            continue;
        }

        headers.set(key, value);
    }

    // Set the correct Host header
    headers.set('Host', TARGET_HOST);

    // Rewrite Referer if present
    const referer = originalRequest.headers.get('referer');
    if (referer) {
        try {
            const refererUrl = new URL(referer);
            // If the referer is our proxy, rewrite it to be the target
            if (refererUrl.pathname.startsWith(PROXY_PATH)) {
                refererUrl.host = TARGET_HOST;
                refererUrl.pathname = refererUrl.pathname.replace(PROXY_PATH, '');
                headers.set('Referer', refererUrl.toString());
            } else {
                // Otherwise set referer to target root to avoid cross-origin issues
                headers.set('Referer', TARGET_ORIGIN + '/');
            }
        } catch {
            // Invalid referer, skip rewriting
        }
    } else {
        // Set a default referer if none exists, as many sites require it
        headers.set('Referer', TARGET_ORIGIN + '/');
    }

    // Rewrite Origin for CORS
    const origin = originalRequest.headers.get('origin');
    if (origin) {
        headers.set('Origin', TARGET_ORIGIN);
    }

    // Add accept-encoding for compressed responses
    headers.set('Accept-Encoding', 'gzip, deflate, br');

    return headers;
}

/**
 * Main proxy handler - for use with Astro/Vite middleware
 */
export async function handleProxyRequest(
    request: Request,
    proxyBase: string
): Promise<Response> {
    const url = new URL(request.url);

    // Strip the proxy path prefix to get the target path
    const targetPath = url.pathname.replace(new RegExp(`^${PROXY_PATH}`), '') || '/';
    const targetUrl = new URL(targetPath + url.search, TARGET_ORIGIN);

    // Create proxied request
    const proxyHeaders = createProxyHeaders(request, targetUrl);

    try {
        const proxyResponse = await fetch(targetUrl.toString(), {
            method: request.method,
            headers: proxyHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.text()
                : undefined,
            redirect: 'manual', // Handle redirects ourselves
        });

        // Create response headers
        const responseHeaders = new Headers();

        for (const [key, value] of proxyResponse.headers.entries()) {
            const lowerKey = key.toLowerCase();

            // Skip hop-by-hop headers
            if (['connection', 'keep-alive', 'transfer-encoding',
                'te', 'trailer', 'upgrade'].includes(lowerKey)) {
                continue;
            }

            // Rewrite Location header for redirects
            if (lowerKey === 'location') {
                let location = value;
                if (location.startsWith('/')) {
                    location = `${PROXY_PATH}${location}`;
                } else if (location.includes(TARGET_HOST)) {
                    location = location.replace(TARGET_ORIGIN, proxyBase);
                }
                responseHeaders.set(key, location);
                continue;
            }

            // Rewrite Set-Cookie headers
            if (lowerKey === 'set-cookie') {
                responseHeaders.append(key, rewriteCookieHeader(value));
                continue;
            }

            // Remove Content-Security-Policy as it may block our proxy
            if (lowerKey === 'content-security-policy' ||
                lowerKey === 'content-security-policy-report-only') {
                continue;
            }

            // Remove X-Frame-Options to allow iframe embedding
            if (lowerKey === 'x-frame-options') {
                continue;
            }

            responseHeaders.set(key, value);
        }

        // Add CORS headers to allow embedding
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', '*');

        // Check if we need to rewrite the response body
        const contentType = proxyResponse.headers.get('content-type');

        if (needsRewriting(contentType)) {
            // Get text content and rewrite
            const text = await proxyResponse.text();
            const rewrittenContent = rewriteContent(text, contentType, proxyBase);

            // Remove content-length and content-encoding as the body is modified
            responseHeaders.delete('content-length');
            responseHeaders.delete('content-encoding');
            responseHeaders.delete('transfer-encoding');

            return new Response(rewrittenContent, {
                status: proxyResponse.status,
                statusText: proxyResponse.statusText,
                headers: responseHeaders,
            });
        }

        // For binary content, pass through as-is
        // We must remove content-encoding because fetch() likely decompressed it
        responseHeaders.delete('content-encoding');

        return new Response(proxyResponse.body, {
            status: proxyResponse.status,
            statusText: proxyResponse.statusText,
            headers: responseHeaders,
        });

    } catch (error) {
        console.error('[vidfast-proxy] Error:', error);
        return new Response(`Proxy error: ${error}`, {
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

/**
 * Handle external proxy requests (Universal Proxy)
 * /video/ext/<protocol>/<host>/<path>
 */
export async function handleExtProxyRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // Expected: ['', 'video', 'ext', 'protocol', 'host', ...path]

    if (parts.length < 5) {
        return new Response("Invalid proxy URL format", { status: 400 });
    }

    const protocol = parts[3]; // http or https
    const host = parts[4];
    const path = parts.slice(5).join('/');

    const targetUrl = `${protocol}://${host}/${path}${url.search}`;

    try {
        const headers = new Headers();
        // Forward some headers but spoof Origin/Referer
        const forbidden = ['host', 'origin', 'referer', 'connection', 'keep-alive', 'transfer-encoding'];

        for (const [key, value] of request.headers.entries()) {
            if (!forbidden.includes(key.toLowerCase())) {
                headers.set(key, value);
            }
        }

        // Spoof headers to make it look like it comes from vidfast or the target itself
        // Most streams permit if Referer is vidfast.pro
        headers.set('Origin', TARGET_ORIGIN);
        headers.set('Referer', TARGET_ORIGIN + '/');

        const response = await fetch(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
            redirect: 'follow'
        });

        const responseHeaders = new Headers(response.headers);

        // Allow CORS for everything
        responseHeaders.set('Access-Control-Allow-Origin', '*');
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
        responseHeaders.set('Access-Control-Allow-Headers', '*');

        // Remove framing protection
        responseHeaders.delete('x-frame-options');
        responseHeaders.delete('content-security-policy');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (e) {
        console.error('[vidfast-ext-proxy] Error:', e);
        return new Response(`External proxy error: ${e}`, { status: 502 });
    }
}

/**
 * Check if a request path should be proxied
 */
export function shouldProxy(pathname: string): boolean {
    return pathname.startsWith(PROXY_PATH) ||
        pathname.startsWith('/_next/') ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/cdn-cgi/') ||
        pathname.startsWith('/hezushon/') ||
        pathname === '/4k.png';
}

export { PROXY_PATH, TARGET_HOST, TARGET_ORIGIN };
