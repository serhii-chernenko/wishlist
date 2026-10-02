import type { SupportLink } from '../../bot/content/support-links';
import type { SharePageLanguage } from './public-id';

export interface ShareWishView {
    title: string;
    description: string | null;
    link: string | null;
    price: number;
    priority: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface SharePageModel {
    language: SharePageLanguage;
    publicId: string;
    origin: string;
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
