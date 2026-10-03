import type { WebTheme } from '../theme';
import type { SupportLink } from '../../bot/content/support-links';
import type { SharePageLanguage } from './public-id';

export interface ShareWishPhoto {
    url: string;
    alt: string;
}

export interface ShareWishView {
    title: string;
    description: string | null;
    link: string | null;
    price: number;
    priority: boolean;
    createdAt: Date;
    updatedAt: Date;
    photos?: readonly ShareWishPhoto[];
}

export interface SharePageModel {
    language: SharePageLanguage;
    theme?: WebTheme;
    publicId: string;
    origin: string;
    assetVersion: string;
    displayName: string | null;
    username: string | null;
    payments: string | null;
    currency: string;
    visibleCount: number;
    lastUpdatedAt: Date | null;
    wishes: readonly ShareWishView[];
    indexable: boolean;
    botUrl: string;
    githubUrl: string;
    supportLinks: readonly SupportLink[];
}

export interface HomePageModel {
    language: SharePageLanguage;
    theme?: WebTheme;
    origin: string;
    assetVersion: string;
    indexable: boolean;
    botUrl: string;
    githubUrl: string;
    authorUrl: string;
    princessUrl: string;
    supportLinks: readonly SupportLink[];
}
