import type { GiverSummaryDto, ThirdWishDto } from '../../shared/app-api';

export type GiversLine =
    | { key: 'you' }
    | { key: 'somebodyAndYou'; count: number }
    | { key: 'somebody'; count: number };

export type GiveAction = 'give' | 'take';

export const NO_GIVERS: GiverSummaryDto = { kind: 'none', count: 0 };

export const isGivenByViewer = (summary: GiverSummaryDto) => {
    return summary.kind === 'you' || summary.kind === 'somebodyAndYou';
};

export const nextGiveAction = (summary: GiverSummaryDto): GiveAction => {
    return isGivenByViewer(summary) ? 'take' : 'give';
};

export const applyGive = (summary: GiverSummaryDto): GiverSummaryDto => {
    if (summary.kind === 'none') {
        return { kind: 'you', count: 1 };
    }

    if (summary.kind === 'somebody') {
        return { kind: 'somebodyAndYou', count: summary.count };
    }

    return summary;
};

export const applyTake = (summary: GiverSummaryDto): GiverSummaryDto => {
    if (summary.kind === 'you') {
        return NO_GIVERS;
    }

    if (summary.kind === 'somebodyAndYou') {
        return { kind: 'somebody', count: summary.count };
    }

    return summary;
};

export const applyGiveAction = (
    summary: GiverSummaryDto,
    action: GiveAction
): GiverSummaryDto => {
    return action === 'give' ? applyGive(summary) : applyTake(summary);
};

export const describeGivers = (summary: GiverSummaryDto): GiversLine | null => {
    if (summary.kind === 'you') {
        return { key: 'you' };
    }

    if (summary.kind === 'none') {
        return null;
    }

    return { key: summary.kind, count: summary.count };
};

export const replaceWish = (
    items: readonly ThirdWishDto[],
    wish: ThirdWishDto
): ThirdWishDto[] => {
    return items.map(item => {
        return item.id === wish.id ? wish : item;
    });
};

export const withGiveAction = (
    items: readonly ThirdWishDto[],
    wishId: number,
    action: GiveAction
): ThirdWishDto[] => {
    return items.map(item => {
        return item.id === wishId
            ? { ...item, givers: applyGiveAction(item.givers, action) }
            : item;
    });
};

export const removeWish = (
    items: readonly ThirdWishDto[],
    wishId: number
): ThirdWishDto[] => {
    return items.filter(item => {
        return item.id !== wishId;
    });
};
