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
