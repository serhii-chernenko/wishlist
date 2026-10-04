import {
    WISH_PRIORITIES,
    WISH_PRIORITY_LEVELS,
    type WishPriority,
    type WishPriorityLevel
} from './app-api';

export const isWishPriority = (value: unknown): value is WishPriority => {
    return WISH_PRIORITIES.some(priority => {
        return priority === value;
    });
};

export const toWishPriority = (level: number): WishPriority => {
    return (
        WISH_PRIORITIES.find(priority => {
            return WISH_PRIORITY_LEVELS[priority] === level;
        }) ?? 'none'
    );
};

export const toWishPriorityLevel = (
    priority: WishPriority
): WishPriorityLevel => {
    return WISH_PRIORITY_LEVELS[priority];
};
