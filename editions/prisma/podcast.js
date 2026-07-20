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

export function activePodcastChapter(chapters, currentTime) {
  const time = Math.max(0, Number(currentTime) || 0);
  return [...(chapters || [])]
    .filter((chapter) => Number(chapter?.startSeconds) <= time)
    .sort((a, b) => Number(b.startSeconds) - Number(a.startSeconds))[0] || null;
}

const TOPIC_ARTWORK = Object.freeze({
  ai: 'ai',
  energy: 'energy',
  humana: 'humana',
  kentucky_healthcare: 'kentucky-healthcare',
  analytics: 'analytics',
  louisville: 'louisville',
});

export function podcastTopicArtwork(topicId) {
  const slug = TOPIC_ARTWORK[topicId];
  return slug ? `media/topics/${slug}.webp` : null;
}

export function podcastShareUrl(topicId, baseHref) {
  const base = new URL('./', baseHref);
  const slug = TOPIC_ARTWORK[topicId];
  return slug ? new URL(`share/${slug}/`, base).href : base.href;
}

export function requestedPodcastChapter(search = '') {
  return new URLSearchParams(search).get('listen');
}
