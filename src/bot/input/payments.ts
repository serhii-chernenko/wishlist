import { countMeaningfulCharacters } from '../utils/strings';

export const PAYMENTS_MIN_MEANINGFUL_CHARACTERS = 5;

export const isValidPayments = (text: string) => {
    return (
        countMeaningfulCharacters(text) >= PAYMENTS_MIN_MEANINGFUL_CHARACTERS
    );
};
