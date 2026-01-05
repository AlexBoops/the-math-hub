const options = { method: 'GET' };
const playerFrame = document.getElementById("player-frame") as HTMLIFrameElement;
const urlParams = new URLSearchParams(window.location.search);
const movie = urlParams.get('type') === 'movie';
const id = urlParams.get('id');
const season = urlParams.get('s') || '';
const episode = urlParams.get('e') || '';

interface Caption {
    index: number;
    language: string;
    label: string;
    name: string;
    vttUrl: string;
    hlsUrl: string;
    originalUrl: string;
}

interface StreamResponse {
    success: boolean;
    stream: {
        streamId: string;
        video: {
            proxyUrl: string;
            originalUrl: string;
        };
        captions: Caption[];
        urls: {
            videoOnly: string;
            combined: string;
            captions: string[];
        };
    };
    data: {
        title: string;
        poster: string;
        backdrop: string;
    };
}

// Show the player immediately with loading state
playerFrame.src = '/video-player.html';

function initializePlayer(data: StreamResponse) {
    const playerData = {
        videoUrl: data.stream.urls.videoOnly,
        captions: data.stream.captions,
        title: data.data?.title || '',
    };

    // Send data to the player iframe
    playerFrame.contentWindow?.postMessage({
        type: 'INIT_PLAYER',
        data: playerData
    }, '*');
}

// Listen for player ready message
window.addEventListener('message', (event) => {
    if (event.data.type === 'PLAYER_READY') {
        // Player is loaded, now fetch the video data
        if (movie) {
            console.log('Loading movie:', id);
            fetch(`http://localhost:7676/api/movie/${id}`, options)
                .then(res => res.json())
                .then((res: StreamResponse) => {
                    console.log('Movie data:', res);
                    if (res.success) {
                        initializePlayer(res);
                    } else {
                        console.error('Failed to load movie');
                    }
                })
                .catch(err => console.error(err));
        }
        else if (season && episode) {
            console.log('Loading TV:', id, season, episode);
            fetch(`http://localhost:7676/api/tv/${id}/${season}/${episode}`, options)
                .then(res => res.json())
                .then((res: StreamResponse) => {
                    console.log('TV data:', res);
                    if (res.success) {
                        initializePlayer(res);
                    } else {
                        console.error('Failed to load episode');
                    }
                })
                .catch(err => console.error(err));
        }
    }
});