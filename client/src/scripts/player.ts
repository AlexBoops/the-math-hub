const playerFrame = document.getElementById("player-frame") as HTMLIFrameElement;
const urlParams = new URLSearchParams(window.location.search);
const movie = urlParams.get('type') === 'movie';
const id = urlParams.get('id');
const season = urlParams.get('s') || '';
const episode = urlParams.get('e') || '';

if (movie) {
    playerFrame.src = `/video/movie/${id}?theme=2980B9`;
} else if (season && episode) {
    playerFrame.src = `/video/tv/${id}/${season}/${episode}?theme=2980B9`;
} else {
    playerFrame.src = `/video/tv/${id}?theme=2980B9`;
}

playerFrame.addEventListener('load', () => {
    const frameWindow = playerFrame.contentWindow;
    console.log('loaded');
    if (frameWindow) {
        try {
            if (!frameWindow.location.href.includes('/video/')) {
                const newUrl = frameWindow.location.href.replace(window.location.origin, '');
                frameWindow.location.href = `/video${newUrl}`;
            }
        } catch (e) {
            console.error('Cross-origin access blocked or other error:', e);
        }
    }
});