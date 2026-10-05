import type { Message, PhotoSize, User } from 'telegraf/types';

import { escapeUserLabel } from './strings';

export const formatUserName = (
    user: Pick<User, 'username' | 'first_name' | 'last_name'>,
    value: 'nick' | 'name' = 'nick'
) => {
    const name =
        user.first_name || user.last_name
            ? `${user.first_name || ''}${
                  user.first_name && user.last_name ? ' ' : ''
              }${user.last_name || ''}`
            : `@${user.username || ''}`;
    const nick = user.username ? `@${user.username}` : name;
    const result = value === 'name' ? name : nick;

    return escapeUserLabel(result);
};

export const getTelegramDate = (unixSeconds: number | undefined) => {
    if (!unixSeconds) {
        return new Date();
    }

    return new Date(unixSeconds * 1000);
};

export const getMessageText = (message: Message | undefined) => {
    if (message && 'text' in message) {
        return message.text;
    }

    return null;
};

export const getMessageContact = (message: Message | undefined) => {
    if (message && 'contact' in message) {
        return message.contact;
    }

    return null;
};

export const getMessagePhotos = (
    message: Message | undefined
): PhotoSize[] | null => {
    if (message && 'photo' in message) {
        return message.photo;
    }

    return null;
};

export interface ParsedCommand {
    name: string;
    args: string[];
}

export const parseCommand = (message: Message | undefined) => {
    if (!message || !('text' in message)) {
        return null;
    }

    const commandEntity = message.entities?.[0];

    if (commandEntity?.type !== 'bot_command' || commandEntity.offset !== 0) {
        return null;
    }

    const [commandPart] = message.text
        .slice(1, commandEntity.length)
        .split('@');
    const args = message.text
        .slice(commandEntity.length)
        .trim()
        .split(/\s+/)
        .filter(part => {
            return part.length > 0;
        });

    if (!commandPart) {
        return null;
    }

    return { name: commandPart.toLowerCase(), args } satisfies ParsedCommand;
};
