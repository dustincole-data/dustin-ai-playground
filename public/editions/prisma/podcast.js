export function formatPodcastDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (!minutes) return `${remainder} sec`;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

export function podcastAssetPath(path) {
  if (!path) return '';
  return `../../${String(path).replace(/^\/+/, '')}`;
}

export function formatPlayerTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function clampPodcastSeek(currentTime, delta, duration) {
  const end = Math.max(0, Number(duration) || 0);
  return Math.min(end, Math.max(0, (Number(currentTime) || 0) + (Number(delta) || 0)));
}

export function podcastProgress(currentTime, duration) {
  const end = Number(duration) || 0;
  if (end <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((Number(currentTime) || 0) / end) * 100)));
}
