import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiConfig, Episode, PlayItem, SeasonMeta, SeriesInfo, SeriesItem } from '../types';
import { episodeUrl, isHlsExtension, xtream } from '../api';
import { useSpatialNav } from '../hooks/useSpatialNav';
import { Icon } from './Icon';
import { Thumb } from './Thumb';
import { cleanName } from '../utils';

type SeriesDetailProps = {
  config: ApiConfig;
  series: SeriesItem;
  onClose: () => void;
  onPlay: (items: PlayItem[], index: number) => void;
};

export function SeriesDetail({ config, series, onClose, onPlay }: SeriesDetailProps) {
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useSpatialNav(true, panelRef);

  useEffect(() => {
    let alive = true;
    xtream
      .seriesInfo(config, series.series_id)
      .then((data) => {
        if (!alive) return;
        setInfo(data);
        const numbers = Object.keys(data.episodes ?? {}).map(Number).sort((a, b) => a - b);
        setSeason(numbers[0] ?? null);
      })
      .catch((nextError: Error) => {
        if (alive) setError(nextError.message);
      });
    return () => {
      alive = false;
    };
  }, [config, series.series_id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof Element && Boolean(target.closest('input, textarea'));
      if (event.key === 'Escape' || (event.key === 'Backspace' && !typing)) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const seasons = useMemo<SeasonMeta[]>(() => {
    if (info?.seasons?.length) return info.seasons;
    return Object.keys(info?.episodes ?? {})
      .map(Number)
      .sort((a, b) => a - b)
      .map((number) => ({ season_number: number, name: `Season ${number}` }));
  }, [info]);

  const episodes = useMemo<Episode[]>(() => {
    if (season === null) return [];
    return info?.episodes?.[String(season)] ?? [];
  }, [info, season]);

  const details = info?.info;
  const cover = series.cover;
  const backdrop = series.backdrop_path?.[0] || cover;

  const playEpisode = (index: number) => {
    if (season === null) return;
    const queue: PlayItem[] = episodes.map((episode) => {
      const extension = episode.container_extension || 'mp4';
      return {
        title: cleanName(series.name),
        subtitle: `Season ${season} · Episode ${episode.episode_num}`,
        poster: episode.info?.movie_image || cover,
        url: episodeUrl(config, episode.id, extension),
        live: false,
        hls: isHlsExtension(extension),
      };
    });
    onPlay(queue, index);
  };

  return (
    <div className="overlay detail" role="dialog" aria-modal="true" aria-label={series.name} ref={panelRef}>
      <div className="detail-backdrop" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined} />
      <div className="detail-scrim" />
      <div className="detail-inner">
        <button type="button" className="btn btn-ghost detail-back" onClick={onClose} autoFocus>
          <Icon name="back" size={18} /> Back
        </button>

        <div className="detail-hero">
          <div className="detail-poster">
            <Thumb src={cover} name={series.name} variant="poster" />
          </div>
          <div className="detail-info">
            <span className="kicker">{details?.genre || series.genre || 'Series'}</span>
            <h1 className="detail-title">{cleanName(series.name)}</h1>
            <div className="detail-meta">
              {series.rating && <span className="badge">★ {series.rating}</span>}
              {series.releaseDate && <span className="badge">{series.releaseDate.slice(0, 4)}</span>}
              {series.episode_run_time && <span className="badge">{series.episode_run_time} min</span>}
              {seasons.length > 0 && <span className="badge">{seasons.length} season{seasons.length === 1 ? '' : 's'}</span>}
            </div>
            <p className="detail-plot">
              {details?.plot || series.plot || (error ? 'No description available for this show.' : 'Loading details…')}
            </p>
            {details?.cast && <p className="detail-cast">Cast: {details.cast}</p>}
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {seasons.length > 1 && (
          <div className="season-tabs" role="tablist" aria-label="Seasons">
            {seasons.map((item) => (
              <button
                key={item.season_number}
                type="button"
                role="tab"
                aria-selected={season === item.season_number}
                className={`season-tab${season === item.season_number ? ' is-active' : ''}`}
                onClick={() => setSeason(item.season_number)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}

        <div className="episode-list">
          {episodes.map((episode, index) => (
            <button key={`${episode.id}`} type="button" className="episode" onClick={() => playEpisode(index)}>
              <span className="episode-num">E{episode.episode_num}</span>
              <span className="episode-text">
                <span className="episode-title">{episode.title || `Episode ${episode.episode_num}`}</span>
                <span className="episode-sub">
                  {episode.info?.duration ? `${episode.info.duration}` : 'Play episode'}
                  {episode.info?.plot ? ` · ${episode.info.plot}` : ''}
                </span>
              </span>
              <Icon name="play" size={18} />
            </button>
          ))}
          {!error && episodes.length === 0 && (
            <p className="picker-empty">{info ? 'No episodes listed for this season.' : 'Loading episodes…'}</p>
          )}
        </div>
      </div>
    </div>
  );
}
