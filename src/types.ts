export type ApiConfig = {
  url: string;
  username: string;
  password: string;
};

export type UserInfo = {
  username: string;
  password?: string;
  message?: string;
  auth: number;
  status: string;
  exp_date: string | null;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats?: string[];
};

export type ServerInfo = {
  url: string;
  port: string;
  https_port?: string;
  server_protocol?: string;
  timezone?: string;
  time_now?: string;
};

export type LoginResponse = {
  user_info: UserInfo;
  server_info: ServerInfo;
};

export type Category = {
  category_id: string;
  category_name: string;
  parent_id: number;
};

export type LiveStream = {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number;
  stream_icon?: string;
  epg_channel_id?: string | null;
  added?: string;
  category_id?: string;
  tv_archive?: number;
};

export type VodStream = {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number;
  stream_icon?: string;
  rating?: string;
  rating_5based?: number;
  added?: string;
  category_id?: string;
  container_extension?: string;
};

export type SeriesItem = {
  num?: number;
  name: string;
  series_id: number;
  cover?: string;
  plot?: string;
  cast?: string;
  director?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string;
  rating_5based?: number;
  backdrop_path?: string[];
  episode_run_time?: string;
  category_id?: string;
  seasons?: SeasonMeta[];
};

export type SeasonMeta = {
  season_number: number;
  name: string;
  cover?: string;
  cover_big?: string;
  episode_count?: number;
  overview?: string;
};

export type Episode = {
  id: string | number;
  episode_num: number;
  title: string;
  container_extension?: string;
  season?: number;
  info?: {
    plot?: string;
    duration?: string;
    duration_secs?: number;
    movie_image?: string;
    rating?: number;
  };
};

export type SeriesInfo = {
  seasons?: SeasonMeta[];
  info?: Partial<SeriesItem>;
  episodes?: Record<string, Episode[]>;
};

export type VodInfo = {
  info?: {
    plot?: string;
    description?: string;
    cast?: string;
    genre?: string;
    duration?: string;
    duration_secs?: string | number;
    releasedate?: string;
    releaseDate?: string;
    movie_image?: string;
    backdrop_path?: string[] | string;
    youtube_trailer?: string;
    rating?: string | number;
    director?: string;
    country?: string;
  };
  movie_data?: {
    stream_id: number;
    name: string;
    container_extension?: string;
  };
};

export type PlayItem = {
  title: string;
  subtitle?: string;
  poster?: string;
  url: string;
  live: boolean;
  hls: boolean;
};

export type Tab = 'live' | 'movies' | 'series';
