export type UserRank = 'restricted' | 'regular' | 'power' | 'moderator' | 'administrator';
export type AvatarStyle = 'gravatar' | 'manual';
export type Safety = 'safe' | 'sketchy' | 'unsafe';
export type PostType = 'image' | 'animation' | 'video' | 'flash';
export type SnapshotOperation = 'created' | 'modified' | 'deleted' | 'merged';
export type ResourceType = 'tag' | 'tag_category' | 'post' | 'pool' | 'pool_category';
export type PostField =
    | 'version'
    | 'id'
    | 'creationTime'
    | 'lastEditTime'
    | 'safety'
    | 'source'
    | 'type'
    | 'checksum'
    | 'contentHash'
    | 'fileSize'
    | 'canvasWidth'
    | 'canvasHeight'
    | 'contentUrl'
    | 'thumbnailUrl'
    | 'flags'
    | 'tags'
    | 'relations'
    | 'notes'
    | 'user'
    | 'score'
    | 'ownScore'
    | 'ownFavorite'
    | 'tagCount'
    | 'favoriteCount'
    | 'commentCount'
    | 'noteCount'
    | 'featureCount'
    | 'relationCount'
    | 'lastFeatureTime'
    | 'favoritedBy'
    | 'hasCustomThumbnail'
    | 'mimeType'
    | 'comments'
    | 'pools';

export interface MicroUser {
    name: string;
    avatarUrl: string;
}

export interface User extends MicroUser {
    version: string;
    email: string | null | false;
    rank: UserRank;
    lastLoginTime: string;
    creationTime: string;
    avatarStyle: AvatarStyle;
    commentCount: number;
    uploadedPostCount: number;
    likedPostCount: number | false;
    dislikedPostCount: number | false;
    favoritePostCount: number;
}

export interface UserToken {
    user: MicroUser;
    token: string;
    note: string;
    enabled: boolean;
    expirationTime: string;
    version: string;
    creationTime: string;
    lastEditTime: string;
    lastUsageTime: string;
}

export interface TagCategory {
    version: string;
    name: string;
    color: string;
    usages: number;
    order: number;
    default: boolean;
}

export interface MicroTag {
    names: string[];
    category: string;
    usages: number;
}

export interface Tag extends MicroTag {
    version: string;
    implications: MicroTag[];
    suggestions: MicroTag[];
    creationTime: string;
    lastEditTime: string;
    description: string;
}

export interface Note {
    polygon: [number, number][];
    text: string;
}

export interface MicroPost {
    id: number;
    thumbnailUrl: string;
}

export interface Post extends MicroPost {
    version: string;
    creationTime: string;
    lastEditTime: string;
    safety: Safety;
    source: string;
    type: PostType;
    checksum: string;
    contentHash: string;
    fileSize: number;
    canvasWidth: number;
    canvasHeight: number;
    contentUrl: string;
    flags: string[];
    tags: MicroTag[];
    relations: MicroPost[];
    notes: Note[];
    user: MicroUser;
    score: number;
    ownScore: number;
    ownFavorite: boolean;
    tagCount: number;
    favoriteCount: number;
    commentCount: number;
    noteCount: number;
    featureCount: number;
    relationCount: number;
    lastFeatureTime: string | null;
    favoritedBy: MicroUser[];
    hasCustomThumbnail: boolean;
    mimeType: string;
    comments: Comment[];
    pools: MicroPool[];
}

export interface PoolCategory {
    version: string;
    name: string;
    color: string;
    usages: number;
    default: boolean;
}

export interface MicroPool {
    id: number;
    names: string[];
    category: string;
    description: string;
    postCount: number;
}

export interface Pool extends MicroPool {
    version: string;
    posts: MicroPost[];
    creationTime: string;
    lastEditTime: string;
}

export interface Comment {
    version: string;
    id: number;
    postId: number;
    user: MicroUser;
    text: string;
    creationTime: string;
    lastEditTime: string;
    score: number;
    ownScore: number;
}

export interface Snapshot {
    operation: SnapshotOperation;
    type: ResourceType;
    id: string | number;
    user: MicroUser;
    data: unknown; // Diff or Full data
    time: string;
}

export interface UnpagedSearchResult<T> {
    results: T[];
}

export interface PagedSearchResult<T> {
    query: string;
    offset: number;
    limit: number;
    total: number;
    results: T[];
}

export interface PostsAround {
    prev: MicroPost | null;
    next: MicroPost | null;
}

export interface ImageSearchResult {
    exactPost: Post | null;
    similarPosts: {
        distance: number;
        post: Post;
    }[];
}

export interface OxibooruError {
    name: string;
    title: string;
    description: string;
}

export interface GlobalInfo {
    postCount: number;
    diskUsage: number;
    featuredPost: Post | null;
    featuringTime: string | null;
    featuringUser: MicroUser | null;
    serverTime: string;
    config: {
        name: string;
        userNameRegex: string;
        passwordRegex: string;
        tagNameRegex: string;
        tagCategoryNameRegex: string;
        defaultUserRank: UserRank;
        enableSafety: boolean;
        contact_email: string;
        canSendMails: boolean;
        privileges: Record<string, unknown>;
    };
}
