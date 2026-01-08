const options = { method: 'GET' };
const playerFrame = document.getElementById("player-frame") as HTMLIFrameElement;
const urlParams = new URLSearchParams(window.location.search);
const movie = urlParams.get('type') === 'movie';
const id = urlParams.get('id');
const season = urlParams.get('s') || '';
const episode = urlParams.get('e') || '';
var fetchUrl = '';

if (window.location.hostname.includes('localhost')) {
    fetchUrl = 'http://localhost:7676';
} else {
    fetchUrl = '/filmapi';
}

interface Caption {
    label: string;
    language: string;
    originalUrl: string;
    proxyUrl: string;
}

interface Source {
    url: string | null;
    language: string | null;
    flag: string | null;
    working: boolean;
    reason: string;
    proxyUrl: string | null;
    playerUrl: string | null;
}

interface FirstWorking {
    player: string;
    streamUrl: string;
    playerUrl: string;
}

interface StreamResponse {
    success: boolean;
    encryptedId: string;
    tmdbId: string;
    type: string;
    workingCount: number;
    workingSources: string[];
    firstWorking: FirstWorking;
    sources: Record<string, Source>;
    captionCount: number;
    captions: Caption[];
}

// Show the player immediately with loading state
playerFrame.src = '/video-player.html';

function initializePlayer(data: StreamResponse) {
    // Map captions to the format your player expects
    const formattedCaptions = data.captions.map((cap, index) => ({
        index: index,
        language: cap.language,
        label: cap.label,
        name: cap.label,
        vttUrl: cap.proxyUrl,       // Use proxy URL for CORS
        hlsUrl: cap.proxyUrl,
        originalUrl: cap.originalUrl
    }));

    const playerData = {
        videoUrl: data.firstWorking.streamUrl,  // ✅ Use firstWorking.streamUrl
        captions: formattedCaptions,
        title: `Movie ${data.tmdbId}`,          // API doesn't return title
        // Optional: pass all working sources for quality switching
        sources: data.workingSources.map(name => ({
            name: name,
            url: data.sources[name].proxyUrl,
            playerUrl: data.sources[name].playerUrl
        }))
    };

    console.log('Initializing player with:', playerData);

    playerFrame.contentWindow?.postMessage({
        type: 'INIT_PLAYER',
        data: playerData
    }, '*');
}

// Listen for player ready message
window.addEventListener('message', (event) => {
    if (event.data.type === 'PLAYER_READY') {
        if (movie) {
            console.log('Loading movie:', id);
            fetch(`${fetchUrl}/api/vidrock?tmdbId=${id}&type=movie`, options)
                .then(res => res.json())
                .then((res: StreamResponse) => {
                    console.log('Movie data:', res);
                    if (res.success && res.workingCount > 0) {
                        initializePlayer(res);
                    } else {
                        console.error('Failed to load movie - no working sources');
                    }
                })
                .catch(err => console.error(err));
        }
        else if (season && episode) {
            console.log('Loading TV:', id, season, episode);
            fetch(`${fetchUrl}/api/vidrock?tmdbId=${id}&type=tv&season=${season}&episode=${episode}`, options)
                .then(res => res.json())
                .then((res: StreamResponse) => {
                    console.log('TV data:', res);
                    if (res.success && res.workingCount > 0) {
                        initializePlayer(res);
                    } else {
                        console.error('Failed to load episode - no working sources');
                    }
                })
                .catch(err => console.error(err));
        }
    }
});