import { rewishAdapter } from './rewish/adapter';
import type { ListImportAdapters } from './types';

export const ADAPTERS: ListImportAdapters = {
    rewish: rewishAdapter
};
