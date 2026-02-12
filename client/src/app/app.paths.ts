export const AppPaths = {
    home: '',
    login: 'login',
    posts: 'posts',
    post: 'post',
    upload: 'upload',
    bulkTagging: 'bulk-tagging',
    libraries: 'libraries',
    info: 'info',
    settings: {
        root: 'settings',
        autoTagging: 'auto-tagging'
    },
    jobs: 'jobs',
    duplicates: 'duplicates'
} as const;

// Helper to build array commands for Router.navigate or [routerLink]
export const AppLinks = {
    home: () => ['/'],
    login: () => ['/', AppPaths.login],
    posts: () => ['/', AppPaths.posts],
    post: (id: string | number) => ['/', AppPaths.post, id],
    upload: () => ['/', AppPaths.upload],
    bulkTagging: () => ['/', AppPaths.bulkTagging],
    libraries: () => ['/', AppPaths.libraries],
    info: () => ['/', AppPaths.info],
    settings: () => ['/', AppPaths.settings.root],
    settingsAutoTagging: () => ['/', AppPaths.settings.root, AppPaths.settings.autoTagging],
    jobs: () => ['/', AppPaths.jobs],
    duplicates: () => ['/', AppPaths.duplicates],
};
