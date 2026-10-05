import fs from 'node:fs';
import path from 'node:path';

export const trickyTitle = 'O\'Brien "Q"; DROP TABLE wishes;-- \u{1F381} Хай';
export const multilineDescription =
    'line one\nline two\n\nhttps://example.com/a?b=c&d=e';
export const orphanOwnerOid = 'ffffffffffffffffffffff01';
export const missingWishOid = 'ffffffffffffffffffffff02';
export const missingUserOid = 'ffffffffffffffffffffff03';

const baseTimestampSeconds = 1_670_000_000;
const userCount = 24;
const floatMarker = '__raw_number__';

export interface RawNumber {
    raw: string;
}

export const rawNumber = (raw: string): RawNumber => ({ raw });

const isRawNumber = (value: unknown): value is RawNumber => {
    return typeof value === 'object' && value !== null && 'raw' in value;
};

export const objectId = (kind: number, index: number) => {
    const seconds = baseTimestampSeconds + kind * 1_000_000 + index * 60;

    return `${seconds.toString(16).padStart(8, '0')}${kind.toString(16).padStart(6, '0')}${index
        .toString(16)
        .padStart(10, '0')}`;
};

export const userObjectId = (index: number) => objectId(1, index);
export const wishObjectId = (index: number) => objectId(2, index);
export const giveObjectId = (index: number) => objectId(3, index);

export interface SyntheticMongoExport {
    users: Record<string, unknown>[];
    wishes: Record<string, unknown>[];
    gives: Record<string, unknown>[];
}

const createUsers = () => {
    return Array.from({ length: userCount }, (_, index) => {
        const user: Record<string, unknown> = {
            _id: { $oid: userObjectId(index) },
            telegramId: 7_000_000 + index,
            __v: 0,
            noticed: true
        };

        if (index % 3 !== 2) {
            user.username = `Fake_User_${String(index).padStart(2, '0')}`;
        }

        if (index % 2 === 0) {
            user.phone = `+38099000${String(index).padStart(4, '0')}`;
        }

        if (index % 5 === 0) {
            user.hideGreeting = index % 10 === 0;
        }

        if (index === 11) {
            user.language = 'ua';
        }

        if (index % 4 !== 3) {
            user.version = index % 8 === 0 ? '1.7.0' : '1.7.1';
        }

        if (index % 6 === 0) {
            user.currency = 'UAH';
        }

        if (index % 7 === 0) {
            user.telegraphAccessToken = '';
            user.payments = '';
        } else if (index % 7 === 1) {
            user.telegraphAccessToken = `fake-token-${index}`;
            user.payments = `Fake jar ${index}\nfake@example.com`;
        }

        if (index % 9 === 0) {
            user.wishlistFilter = null;
        } else if (index % 9 === 1) {
            user.wishlistFilter = index % 5;
        }

        return user;
    });
};

const withFloatTelegramIds = (users: Record<string, unknown>[]) => {
    users[4]!.telegramId = rawNumber('5.733470387E+09');
    users[9]!.telegramId = rawNumber('6100000001.0');
    users[14]!.telegramId = { $numberLong: '6200000002' };
    users[19]!.telegramId = { $numberDouble: '6300000003.0' };
    users[20]!.telegramId = { $numberInt: '2100000004' };
};

const createWishes = () => {
    const wishes: Record<string, unknown>[] = [];
    let wishIndex = 0;

    for (let userIndex = 0; userIndex < userCount; userIndex += 1) {
        const wishTotal = userIndex % 4 === 0 ? 5 : 2;

        for (let offset = 0; offset < wishTotal; offset += 1) {
            const id = wishObjectId(wishIndex);
            const createdAtMilliseconds =
                (baseTimestampSeconds + 100_000 + wishIndex * 3600) * 1000 +
                123;
            const wish: Record<string, unknown> = {
                _id: { $oid: id },
                userId: { $oid: userObjectId(userIndex) },
                title: `Fake wish ${wishIndex}`,
                images: Array.from(
                    { length: wishIndex % 10 },
                    (_, imageIndex) => `fake-file-${wishIndex}-${imageIndex}`
                ),
                priority: wishIndex % 7 === 0,
                createdAt: {
                    $date: new Date(createdAtMilliseconds).toISOString()
                },
                updatedAt: {
                    $date: new Date(
                        createdAtMilliseconds + 60_000
                    ).toISOString()
                },
                __v: 0
            };

            if (wishIndex % 3 === 0) {
                wish.price = 100 * (wishIndex + 1);
            }

            if (wishIndex % 4 === 1) {
                wish.hidden = wishIndex % 8 === 1;
                wish.removed = wishIndex % 8 === 5;
                wish.done = wishIndex % 8 === 5;
            }

            if (wishIndex % 5 === 0) {
                wish.description = multilineDescription;
                wish.link = 'https://example.com/fake';
            } else if (wishIndex % 5 === 1) {
                wish.description = null;
                wish.link = null;
            }

            wishes.push(wish);
            wishIndex += 1;
        }
    }

    wishes[3]!.title = trickyTitle;
    wishes[4]!.title = 'x'.repeat(638);

    for (let orphanIndex = 0; orphanIndex < 6; orphanIndex += 1) {
        const index = wishIndex + orphanIndex;
        const createdAt = new Date(
            (baseTimestampSeconds + 500_000 + orphanIndex) * 1000
        ).toISOString();

        wishes.push({
            _id: { $oid: wishObjectId(index) },
            userId: { $oid: orphanOwnerOid },
            title: `Fake orphan wish ${orphanIndex}`,
            images: orphanIndex === 0 ? ['fake-orphan-file'] : [],
            priority: false,
            createdAt: { $date: createdAt },
            updatedAt: { $date: createdAt },
            __v: 0
        });
    }

    return wishes;
};

const createGives = (wishes: Record<string, unknown>[]) => {
    const activeWishIds = wishes
        .filter(wish => wish.removed !== true)
        .map(wish => (wish._id as { $oid: string }).$oid);
    const removedWish = wishes.find(wish => wish.removed === true);
    const gives: Record<string, unknown>[] = [];
    const addGive = (userOid: string, wishOid: string) => {
        gives.push({
            _id: { $oid: giveObjectId(gives.length) },
            userId: { $oid: userOid },
            wishId: { $oid: wishOid },
            __v: 0
        });
    };

    addGive(userObjectId(1), activeWishIds[0]!);
    addGive(userObjectId(2), activeWishIds[0]!);
    addGive(userObjectId(3), activeWishIds[5]!);
    addGive(userObjectId(4), activeWishIds[activeWishIds.length - 1]!);
    addGive(userObjectId(5), missingWishOid);
    addGive(missingUserOid, activeWishIds[2]!);
    addGive(userObjectId(6), (removedWish!._id as { $oid: string }).$oid);

    return gives;
};

export const createSyntheticMongoExport = (): SyntheticMongoExport => {
    const users = createUsers();

    withFloatTelegramIds(users);

    const wishes = createWishes();

    return { users, wishes, gives: createGives(wishes) };
};

export const serializeRecord = (record: Record<string, unknown>) => {
    return JSON.stringify(record, (_key, value: unknown) => {
        return isRawNumber(value) ? `${floatMarker}${value.raw}` : value;
    }).replace(new RegExp(`"${floatMarker}([^"]+)"`, 'g'), '$1');
};

export const serializeNdjson = (records: Record<string, unknown>[]) => {
    return `${records.map(serializeRecord).join('\n')}\n`;
};

export const writeSyntheticMongoExport = (
    directory: string,
    mongoExport: SyntheticMongoExport = createSyntheticMongoExport()
) => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
        path.join(directory, 'users.json'),
        serializeNdjson(mongoExport.users),
        'utf8'
    );
    fs.writeFileSync(
        path.join(directory, 'wishes.json'),
        serializeNdjson(mongoExport.wishes),
        'utf8'
    );
    fs.writeFileSync(
        path.join(directory, 'gives.json'),
        serializeNdjson(mongoExport.gives),
        'utf8'
    );

    return mongoExport;
};

export const realisticShape = {
    users: 299,
    floatTelegramIds: 56,
    wishes: 1202,
    orphanWishes: 163,
    gives: 19,
    giveWithMissingWish: 1
} as const;

export const createRealisticMongoExport = (): SyntheticMongoExport => {
    const users = Array.from({ length: realisticShape.users }, (_, index) => {
        const user: Record<string, unknown> = {
            _id: { $oid: userObjectId(index) },
            telegramId:
                index < realisticShape.floatTelegramIds
                    ? rawNumber(`${5_000_000_000 + index}.0`)
                    : 100_000_000 + index,
            __v: 0,
            noticed: true
        };

        if (index % 6 !== 0) {
            user.username = `fake_bulk_${index}`;
        }

        if (index % 3 === 0) {
            user.phone = `+3809${String(index).padStart(8, '0')}`;
        }

        if (index % 36 !== 35) {
            user.version = index % 150 === 0 ? '1.7.0' : '1.7.1';
        }

        if (index % 3 === 1) {
            user.currency = 'UAH';
        }

        return user;
    });
    const activeWishCount = realisticShape.wishes - realisticShape.orphanWishes;
    const wishes = Array.from({ length: realisticShape.wishes }, (_, index) => {
        const isOrphan = index >= activeWishCount;
        const timestamp = new Date(
            (baseTimestampSeconds + 100_000 + index * 600) * 1000
        ).toISOString();

        return {
            _id: { $oid: wishObjectId(index) },
            userId: {
                $oid: isOrphan
                    ? orphanOwnerOid
                    : userObjectId(index % realisticShape.users)
            },
            title: `Fake bulk wish ${index}`,
            images: Array.from({ length: index % 4 }, (_, imageIndex) => {
                return `fake-bulk-${index}-${imageIndex}`;
            }),
            priority: index % 11 === 0,
            price: index % 5 === 0 ? 0 : index * 10,
            createdAt: { $date: timestamp },
            updatedAt: { $date: timestamp },
            __v: 0
        };
    });
    const gives = Array.from({ length: realisticShape.gives }, (_, index) => {
        const isMissingWish = index === 0;

        return {
            _id: { $oid: giveObjectId(index) },
            userId: { $oid: userObjectId(100 + index) },
            wishId: {
                $oid: isMissingWish ? missingWishOid : wishObjectId(index)
            },
            __v: 0
        };
    });

    return { users, wishes, gives };
};
