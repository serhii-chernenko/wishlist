import { defineRelations } from 'drizzle-orm';

import * as schema from './schema';

export const relations = defineRelations(schema, r => {
    return {
        users: {
            wishes: r.many.wishes({
                from: r.users.id,
                to: r.wishes.userId
            }),
            gives: r.many.gives({
                from: r.users.id,
                to: r.gives.userId
            }),
            releaseAnnouncements: r.many.releaseAnnouncements({
                from: r.users.id,
                to: r.releaseAnnouncements.userId
            }),
            share: r.one.wishlistShares({
                from: r.users.id,
                to: r.wishlistShares.userId
            }),
            listImports: r.many.listImports({
                from: r.users.id,
                to: r.listImports.userId
            })
        },
        wishes: {
            user: r.one.users({
                from: r.wishes.userId,
                to: r.users.id,
                optional: true
            }),
            gives: r.many.gives({
                from: r.wishes.id,
                to: r.gives.wishId
            })
        },
        gives: {
            user: r.one.users({
                from: r.gives.userId,
                to: r.users.id,
                optional: false
            }),
            wish: r.one.wishes({
                from: r.gives.wishId,
                to: r.wishes.id,
                optional: false
            })
        },
        releaseAnnouncements: {
            user: r.one.users({
                from: r.releaseAnnouncements.userId,
                to: r.users.id,
                optional: false
            })
        },
        wishlistShares: {
            user: r.one.users({
                from: r.wishlistShares.userId,
                to: r.users.id,
                optional: false
            })
        },
        listImports: {
            user: r.one.users({
                from: r.listImports.userId,
                to: r.users.id,
                optional: false
            })
        }
    };
});
