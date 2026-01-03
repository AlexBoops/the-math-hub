import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import node from "@astrojs/node";

const TMDB_API_KEY = 'ca53aa13ab3965a3539b02d893865f94';

export default defineConfig({
    root: "./client",
    outDir: "./dist",
    publicDir: "./client/public",
    srcDir: "./client/src",
    output: 'server',
    adapter: node({
        mode: 'standalone',
    }),
    vite: {
        server: {
            fs: {
                allow: ['.'],
            },
            proxy: {
                '/streamapi': {
                    target: 'https://api.themoviedb.org/3',
                    changeOrigin: true,
                    secure: true,
                    rewrite: (path) => {
                        const newPath = path.replace(/^\/streamapi/, '');
                        return newPath.includes('?')
                            ? `${newPath}&api_key=${TMDB_API_KEY}`
                            : `${newPath}?api_key=${TMDB_API_KEY}`;
                    },
                },
            },
        },
        plugins: [
            tailwindcss(),
            {
                name: 'html-fallback',
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        if (req.url && req.url.endsWith('/')) {
                            req.url += 'index.html';
                        }
                        next();
                    });
                },
            },
        ],
    },
    server: {
        port: 8080,
        host: true // Bind to all interfaces (0.0.0.0) which is required for containerized environments
    }
});