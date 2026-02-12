/**
 * SauceNAO API Models
 * Documentation: https://saucenao.com/user.php?page=search-api
 */

export enum SaucenaoDb {
  Danbooru = 9,
  Gelbooru = 25,
}

export interface SaucenaoResponse {
  header: SaucenaoHeader;
  results: SaucenaoResult[];
}

export interface SaucenaoHeader {
  status: number;
  message: string;
  results_requested: number;
  index?: Record<string, SaucenaoIndexHeader>;
  search_depth?: string;
  minimum_similarity?: number;
  query_image_display?: string;
  query_image?: string;
  results_returned?: number;
  short_limit?: string;
  long_limit?: string;
}

export interface SaucenaoIndexHeader {
  status: number;
  parent_id: number;
  id: number;
  results: number;
}

export interface SaucenaoResult {
  header: SaucenaoResultHeader;
  data: SaucenaoResultData;
}

export interface SaucenaoResultHeader {
  similarity: string;
  thumbnail: string;
  index_id: number;
  index_name: string;
  dupes?: number;
  hidden?: number;
}

export interface SaucenaoResultData {
  ext_urls?: string[];
  title?: string;
  author_name?: string;
  author_url?: string;
  source?: string;

  // Index specific fields
  danbooru_id?: number;
  gelbooru_id?: number;
  yandere_id?: number;
  konachan_id?: number;
  pixiv_id?: number;
  pawoo_id?: number;
  pawoo_user_acct?: string;
  pawoo_user_username?: string;

  // Generic fallback
  post_id?: number;
}
