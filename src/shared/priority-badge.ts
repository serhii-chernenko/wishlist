import type { WishPriority } from './app-api';

export type BadgePriority = Exclude<WishPriority, 'none'>;

export const BADGE_PRIORITIES: readonly BadgePriority[] = [
    'low',
    'medium',
    'high'
];

export const isBadgePriority = (
    priority: WishPriority
): priority is BadgePriority => {
    return priority !== 'none';
};
