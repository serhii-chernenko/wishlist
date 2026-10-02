import { drizzle } from 'drizzle-orm/d1';

import { relations } from './relations';
import * as schema from './schema';

export const createDb = (env: { DB: D1Database }) => {
    return drizzle(env.DB, { schema, relations });
};

export type AppDb = ReturnType<typeof createDb>;
