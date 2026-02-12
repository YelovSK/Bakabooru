/**
 * Gelbooru API Models
 * Documentation: https://gelbooru.com/index.php?page=help&topic=dapi
 */

export interface GelbooruResponse {
  post?: GelbooruPost[];
  tag?: GelbooruTag[];
  "@attributes"?: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface GelbooruPost {
  id: number;
  created_at: string;
  score: number;
  width: number;
  height: number;
  md5: string;
  directory: string;
  image: string;
  rating: string;
  source: string;
  change: number;
  owner: string;
  creator_id: number;
  parent_id: number;
  sample: number;
  preview_height: number;
  preview_width: number;
  tags: string;
  title: string;
  has_notes: string;
  has_comments: string;
  file_url: string;
  preview_url: string;
  sample_url: string;
  sample_width: number;
  sample_height: number;
  status: string;
  post_locked: number;
  has_children: string;
  [key: string]: unknown;
}

export interface GelbooruTag {
  id: number;
  name: string;
  count: number;
  type: number;
  ambiguous: number;
}
