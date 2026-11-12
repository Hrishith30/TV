import { useEffect, useRef, useState } from 'react';
import type { ApiConfig, PlayItem, VodInfo, VodStream } from '../types';
import { isHlsExtension, movieUrl, xtream } from '../api';
import { useSpatialNav } from '../hooks/useSpatialNav';
import { Icon } from './Icon';
import { Thumb } from './Thumb';
import { cleanName } from '../utils';

type MovieDetailProps = {
  config: ApiConfig;
  movie: VodStream;
  onClose: () => void;
  onPlay: (items: PlayItem[], index: number) => void;
};

function firstBackdrop(value: string[] | string | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function MovieDetail({ config, movie, onClose, onPlay }: MovieDetailProps) {
  const [info, setInfo] = useState<VodInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useSpatialNav(true, panelRef);

  useEffect(() => {
    let alive = true;
    xtream
      .vodInfo(config, movie.stream_id)
      .then((data) => {
        if (alive) setInfo(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [config, movie.stream_id]);

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

  const details = info?.info;
  const extension = info?.movie_data?.container_extension || movie.container_extension || 'mp4';
  const backdrop = firstBackdrop(details?.backdrop_path) || movie.stream_icon;
  const year = (details?.releasedate || details?.releaseDate || '').slice(0, 4);

  const play = () => {
    onPlay(
      [
        {
          title: cleanName(movie.name),
          subtitle: details?.genre || 'Movie',
          poster: movie.stream_icon,
          url: movieUrl(config, movie.stream_id, extension),
          live: false,
          hls: isHlsExtension(extension),
        },
      ],
      0,
    );
  };

  return (
    <div className="overlay detail" role="dialog" aria-modal="true" aria-label={movie.name} ref={panelRef}>
      <div className="detail-backdrop" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined} />
      <div className="detail-scrim" />
      <div className="detail-inner">
        <button type="button" className="btn btn-ghost detail-back" onClick={onClose} autoFocus>
          <Icon name="back" size={18} /> Back
        </button>

        <div className="detail-hero">
          <div className="detail-poster">
            <Thumb src={movie.stream_icon} name={movie.name} variant="poster" />
          </div>
          <div className="detail-info">
            <span className="kicker">{details?.genre || 'Movie'}</span>
            <h1 className="detail-title">{cleanName(movie.name)}</h1>
            <div className="detail-meta">
              {movie.rating && <span className="badge">★ {movie.rating}</span>}
              {year && <span className="badge">{year}</span>}
              {details?.duration && <span className="badge">{details.duration}</span>}
              {details?.country && <span className="badge">{details.country}</span>}
            </div>
            <p className="detail-plot">
              {details?.plot || details?.description || (failed ? 'No description available for this title.' : 'Loading details…')}
            </p>
            {details?.cast && <p className="detail-cast">Cast: {details.cast}</p>}
            <div className="detail-actions">
              <button type="button" className="btn btn-primary" onClick={play}>
                <Icon name="play" size={18} /> Play movie
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
