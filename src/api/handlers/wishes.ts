import { toWishFilter } from '../../bot/content/filters';
import { getErrorType } from '../../bot/errors';
import { parseDescription } from '../../bot/input/description';
import { PRICE_MAX_VALUE } from '../../bot/input/limits';
import { parseLink } from '../../bot/input/link';
import { parseWishImages } from '../../bot/input/wish-images';
import { parsePrice } from '../../bot/input/price';
import { parseTitle } from '../../bot/input/title';
import { runRepository } from '../../bot/services/run-repository';
import { createWishService } from '../../bot/services/wish-service';
import type { WishFieldsPatch, WishRecord } from '../../db/repositories';
import type {
    NewWishFields,
    WishFlags
} from '../../db/repositories/wish-repository';
import {
    APP_PAGE_SIZE,
    WISH_PRIORITY_LEVELS,
    type OwnWishDto,
    type WishPriorityLevel,
    type RemovedCountDto,
    type WishFilterDto,
    type WishListDto
} from '../../shared/app-api';
import {
    isCurrency,
    resolveDisplayCurrency,
    resolvePriceBounds,
    type Currency
} from '../../shared/money';
import {
    isWishPriority,
    toWishPriority,
    toWishPriorityLevel
} from '../../shared/priority';
import {
    getSigner,
    readExchangeRates,
    requireUser,
    type ApiContext,
    type ApiHandler
} from '../context';
import {
    mintWishImages,
    resolveViewerLocale,
    toOwnWishDto,
    toPageDto
} from '../dto';
import { ApiError } from '../errors';
import { releaseImagesInBackground } from '../photos/image-cleanup';
import { emitAppAction } from '../telemetry';
import {
    createBodyReader,
    readIdParam,
    readJsonBody,
    readOffset,
    type BodyReader
} from '../validate';

const WISH_FILTER_MIN = 0;
const WISH_FILTER_MAX = 4;
const NO_CONTENT = 204;
const CREATED = 201;

const omitUndefined = <Fields extends object>(fields: Fields) => {
    return Object.fromEntries(
        Object.entries(fields).filter(([, value]) => {
            return value !== undefined;
        })
    ) as { [Key in keyof Fields]?: Exclude<Fields[Key], undefined> };
};

const readTitle = (reader: BodyReader, required: boolean) => {
    if (!reader.has('title')) {
        if (required) {
            reader.fail('title', 'required');
        }

        return undefined;
    }

    const raw = reader.body.title;

    if (typeof raw !== 'string') {
        reader.fail('title', 'invalid');

        return undefined;
    }

    const parsed = parseTitle(raw);

    if (!parsed.ok) {
        reader.fail('title', parsed.reason);

        return undefined;
    }

    return parsed.value;
};

const readRemovableText = (reader: BodyReader, name: string) => {
    if (!reader.has(name)) {
        return { present: false } as const;
    }

    const raw = reader.body[name];

    if (raw === null) {
        return { present: true, text: null } as const;
    }

    if (typeof raw !== 'string') {
        reader.fail(name, 'invalid');

        return { present: false } as const;
    }

    return {
        present: true,
        text: raw.trim() === '' ? null : raw
    } as const;
};

const readDescription = (reader: BodyReader) => {
    const read = readRemovableText(reader, 'description');

    if (!read.present) {
        return undefined;
    }

    if (read.text === null) {
        return null;
    }

    const parsed = parseDescription(read.text, []);

    if (!parsed.ok) {
        reader.fail('description', parsed.reason);

        return undefined;
    }

    return parsed.value;
};

const readLink = (reader: BodyReader) => {
    const read = readRemovableText(reader, 'link');

    if (!read.present) {
        return undefined;
    }

    if (read.text === null) {
        return null;
    }

    const parsed = parseLink(read.text, []);

    if (!parsed.ok) {
        reader.fail('link', parsed.reason);

        return undefined;
    }

    return parsed.value;
};

const readNumericPrice = (reader: BodyReader, value: number) => {
    if (!Number.isFinite(value) || value < 0 || value > PRICE_MAX_VALUE) {
        reader.fail('price', 'invalid');

        return undefined;
    }

    return Math.round(value);
};

const readTextPrice = (reader: BodyReader, text: string) => {
    if (text.trim() === '') {
        return 0;
    }

    const parsed = parsePrice(text, []);

    if (!parsed.ok) {
        reader.fail('price', parsed.reason);

        return undefined;
    }

    return parsed.value;
};

const readPrice = (reader: BodyReader) => {
    if (!reader.has('price')) {
        return undefined;
    }

    const raw = reader.body.price;

    if (raw === null) {
        return 0;
    }

    if (typeof raw === 'number') {
        return readNumericPrice(reader, raw);
    }

    if (typeof raw === 'string') {
        return readTextPrice(reader, raw);
    }

    reader.fail('price', 'invalid');

    return undefined;
};

const readCurrency = (reader: BodyReader): Currency | undefined => {
    if (!reader.has('currency')) {
        return undefined;
    }

    const raw = reader.body.currency;

    if (isCurrency(raw)) {
        return raw;
    }

    reader.fail('currency', 'invalid');

    return undefined;
};

const toLegacyPriorityLevel = (value: boolean): WishPriorityLevel => {
    return value ? WISH_PRIORITY_LEVELS.high : WISH_PRIORITY_LEVELS.none;
};

const readPriorityLevel = (
    reader: BodyReader
): WishPriorityLevel | undefined => {
    if (!reader.has('priority')) {
        return undefined;
    }

    const raw = reader.body.priority;

    if (typeof raw === 'boolean') {
        return toLegacyPriorityLevel(raw);
    }

    if (isWishPriority(raw)) {
        return toWishPriorityLevel(raw);
    }

    reader.fail('priority', 'invalid');

    return undefined;
};

interface WishInput {
    title: string | undefined;
    description: string | null | undefined;
    link: string | null | undefined;
    price: number | undefined;
    currency: Currency | undefined;
    priorityLevel: WishPriorityLevel | undefined;
    hidden: boolean | undefined;
}

const readWishInput = async (
    c: ApiContext,
    requireTitle: boolean
): Promise<WishInput> => {
    const reader = createBodyReader(await readJsonBody(c));
    const input: WishInput = {
        title: readTitle(reader, requireTitle),
        description: readDescription(reader),
        link: readLink(reader),
        price: readPrice(reader),
        currency: readCurrency(reader),
        priorityLevel: readPriorityLevel(reader),
        hidden: reader.optionalBoolean('hidden')
    };

    reader.finish();

    return input;
};

type WishUpdateField =
    | 'title'
    | 'description'
    | 'link'
    | 'price'
    | 'currency'
    | 'priority'
    | 'visibility';

const getUpdatedFields = (input: WishInput): WishUpdateField[] => {
    const candidates: [WishUpdateField, unknown][] = [
        ['title', input.title],
        ['description', input.description],
        ['link', input.link],
        ['price', input.price],
        ['currency', input.currency],
        ['priority', input.priorityLevel],
        ['visibility', input.hidden]
    ];

    return candidates
        .filter(([, value]) => {
            return value !== undefined;
        })
        .map(([field]) => {
            return field;
        });
};

const toWishResponse = async (
    c: ApiContext,
    wish: WishRecord
): Promise<OwnWishDto> => {
    const images = await mintWishImages(
        {
            crypto: c.var.deps.crypto,
            signer: getSigner(c),
            now: c.var.deps.now(),
            audience: 'owner'
        },
        wish
    );

    return toOwnWishDto(wish, images);
};

const clearSessionReferences = async (
    c: ApiContext,
    scope: readonly number[] | 'all'
) => {
    try {
        await runRepository(
            c.var.repos.sessions.clearWishReferences(c.var.actor.id, scope)
        );
    } catch (error) {
        console.warn(
            JSON.stringify({
                event: 'app_wish_session_cleanup_failed',
                errorType: getErrorType(error)
            })
        );
    }
};

const getWishService = (c: ApiContext) => {
    return createWishService(c.var.repos, c.var.deps.now);
};

export const listWishes: ApiHandler = async c => {
    const user = requireUser(c);
    const offset = readOffset(c);
    const filter = getWishService(c).getOwnerFilter(user);
    const priceBounds =
        filter === null
            ? null
            : resolvePriceBounds(
                  filter,
                  resolveDisplayCurrency(
                      user.currency,
                      resolveViewerLocale(c.var.actor, user)
                  ),
                  await readExchangeRates(c)
              );
    const page = await runRepository(
        c.var.repos.wishes.listOwnedWithGifted(user.id, {
            filter: priceBounds,
            offset,
            limit: APP_PAGE_SIZE
        })
    );
    const items = await Promise.all(
        page.items.map(wish => {
            return toWishResponse(c, wish);
        })
    );
    const body: WishListDto = {
        ...toPageDto(items, page.total + page.giftedTotal, offset),
        total: page.total,
        filter,
        giftedTotal: page.giftedTotal
    };

    return c.json(body);
};

export const setWishFilter: ApiHandler = async c => {
    const user = requireUser(c);
    const reader = createBodyReader(await readJsonBody(c));
    const filter = toWishFilter(
        reader.nullableIntegerInRange(
            'filter',
            WISH_FILTER_MIN,
            WISH_FILTER_MAX
        )
    );

    reader.finish();

    if (!(await getWishService(c).setOwnerFilter(user, filter))) {
        throw new ApiError('internal');
    }

    emitAppAction(c, 'wishlist_filtered', {
        result: filter === null ? 'reset' : 'set'
    });

    const body: WishFilterDto = { filter };

    return c.json(body);
};

export const createWish: ApiHandler = async c => {
    const user = requireUser(c);
    const input = await readWishInput(c, true);
    const fields = omitUndefined({
        title: input.title,
        description: input.description,
        link: input.link,
        price: input.price,
        currency:
            input.currency ??
            resolveDisplayCurrency(
                user.currency,
                resolveViewerLocale(c.var.actor, user)
            ),
        priorityLevel: input.priorityLevel,
        hidden: input.hidden
    }) as NewWishFields;
    const service = getWishService(c);

    if (await service.isWishLimitReached(user.id)) {
        throw new ApiError('wishLimit');
    }

    const wish = await service.createWithFields(user.id, fields);

    if (wish === null) {
        throw new ApiError('internal');
    }

    emitAppAction(c, 'wish_created');

    return c.json(await toWishResponse(c, wish), CREATED);
};

export const getWish: ApiHandler = async c => {
    const user = requireUser(c);
    const wish = await getWishService(c).findOwned(
        readIdParam(c, 'id'),
        user.id
    );

    if (wish === null) {
        throw new ApiError('notFound');
    }

    return c.json(await toWishResponse(c, wish));
};

export const updateWish: ApiHandler = async c => {
    const user = requireUser(c);
    const wishId = readIdParam(c, 'id');
    const input = await readWishInput(c, false);
    const service = getWishService(c);
    const fieldsPatch = omitUndefined({
        title: input.title,
        description: input.description,
        link: input.link,
        price: input.price,
        currency: input.currency
    }) as WishFieldsPatch;
    const flags = omitUndefined({
        priorityLevel: input.priorityLevel,
        hidden: input.hidden
    }) as WishFlags;

    const previousPriorityLevel =
        input.priorityLevel === undefined
            ? undefined
            : (await service.findOwned(wishId, user.id))?.priorityLevel;

    if (
        Object.keys(fieldsPatch).length > 0 &&
        !(await service.updateFields(wishId, user.id, fieldsPatch))
    ) {
        throw new ApiError('notFound');
    }

    const wish = await service.setFlags(wishId, user.id, flags);

    if (wish === null) {
        throw new ApiError('notFound');
    }

    for (const field of getUpdatedFields(input)) {
        if (field !== 'priority') {
            emitAppAction(c, 'wish_updated', { field });
        }
    }

    if (
        input.priorityLevel !== undefined &&
        input.priorityLevel !== previousPriorityLevel
    ) {
        emitAppAction(c, 'wish_priority_set', {
            result: toWishPriority(input.priorityLevel)
        });
    }

    return c.json(await toWishResponse(c, wish));
};

export const removeWish: ApiHandler = async c => {
    const user = requireUser(c);
    const wishId = readIdParam(c, 'id');
    const reader = createBodyReader(await readJsonBody(c));
    const done = reader.requiredBoolean('done');

    reader.finish();

    const service = getWishService(c);
    const removedWish = await service.findOwned(wishId, user.id);

    if (
        removedWish === null ||
        !(await service.remove(wishId, user.id, done === true))
    ) {
        throw new ApiError('notFound');
    }

    await releaseImagesInBackground(c, parseWishImages(removedWish.images));
    await clearSessionReferences(c, [wishId]);
    emitAppAction(c, 'wish_removed', {
        result: done === true ? 'done' : 'dropped'
    });

    return c.body(null, NO_CONTENT);
};

export const cleanWishes: ApiHandler = async c => {
    const user = requireUser(c);
    const service = getWishService(c);
    const imageFileIds = await service.listActiveImageFileIds(user.id);
    const removed = await service.removeAll(user.id);

    if (removed > 0) {
        await releaseImagesInBackground(c, imageFileIds);
        await clearSessionReferences(c, 'all');
        emitAppAction(c, 'wishlist_cleaned');
    }

    const body: RemovedCountDto = { removed };

    return c.json(body);
};
