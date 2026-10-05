import type { Update, User } from 'telegraf/types';

export interface TestUser {
    id: number;
    is_bot: false;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

export interface TestChat {
    id: number;
    type: 'private' | 'group' | 'supergroup' | 'channel';
    first_name?: string;
    title?: string;
}

export const TEST_MESSAGE_DATE = 1_800_000_000;

export const BOT_USER_ID = 123456;

export const createTestUser = (
    id: number,
    overrides: Partial<Omit<TestUser, 'id' | 'is_bot'>> = {}
): TestUser => {
    return {
        id,
        is_bot: false,
        first_name: 'Olena',
        language_code: 'uk',
        ...overrides
    };
};

export const createPrivateChat = (user: Pick<TestUser, 'id'>): TestChat => {
    return { id: user.id, type: 'private', first_name: 'Olena' };
};

export const createGroupChat = (id = -1001): TestChat => {
    return { id, type: 'supergroup', title: 'Friends' };
};

export interface PhotoOptions {
    fileId: string;
    mediaGroupId?: string;
    caption?: string;
}

export interface ContactOptions {
    phoneNumber: string;
    userId?: number;
    firstName?: string;
}

export type ChatMemberStatus = 'member' | 'kicked' | 'left' | 'administrator';

export interface UpdateBuilders {
    nextUpdateId(): number;
    message(user: TestUser, text: string, chat?: TestChat): Update;
    command(user: TestUser, text: string, chat?: TestChat): Update;
    callback(user: TestUser, data: string | undefined): Update;
    contact(user: TestUser, options: ContactOptions): Update;
    photo(user: TestUser, options: PhotoOptions): Update;
    myChatMember(
        user: TestUser,
        status: ChatMemberStatus,
        chat?: TestChat
    ): Update;
    editedMessage(user: TestUser, text: string): Update;
    withUpdateId(update: Update, updateId: number): Update;
}

const withMessageBase = (
    updateId: number,
    user: TestUser,
    chat: TestChat,
    fields: Record<string, unknown>
) => {
    return {
        update_id: updateId,
        message: {
            message_id: updateId,
            date: TEST_MESSAGE_DATE,
            chat,
            from: user,
            ...fields
        }
    } as unknown as Update;
};

const buildCommandEntity = (text: string) => {
    const [commandToken = text] = text.split(/\s+/);

    return [{ type: 'bot_command', offset: 0, length: commandToken.length }];
};

export const createUpdateBuilders = (firstUpdateId = 1): UpdateBuilders => {
    let nextId = firstUpdateId;
    const nextUpdateId = () => {
        const current = nextId;

        nextId += 1;

        return current;
    };

    return {
        nextUpdateId,
        message(user, text, chat = createPrivateChat(user)) {
            return withMessageBase(nextUpdateId(), user, chat, { text });
        },
        command(user, text, chat = createPrivateChat(user)) {
            return withMessageBase(nextUpdateId(), user, chat, {
                text,
                entities: buildCommandEntity(text)
            });
        },
        callback(user, data) {
            const updateId = nextUpdateId();

            return {
                update_id: updateId,
                callback_query: {
                    id: `cbq-${updateId}`,
                    from: user,
                    chat_instance: 'chat-instance',
                    ...(data === undefined ? {} : { data }),
                    message: {
                        message_id: updateId + 100_000,
                        date: TEST_MESSAGE_DATE,
                        chat: createPrivateChat(user),
                        from: {
                            id: BOT_USER_ID,
                            is_bot: true,
                            first_name: 'Wishlist'
                        },
                        text: 'previous message'
                    }
                }
            } as unknown as Update;
        },
        contact(user, options) {
            return withMessageBase(
                nextUpdateId(),
                user,
                createPrivateChat(user),
                {
                    contact: {
                        phone_number: options.phoneNumber,
                        first_name: options.firstName ?? user.first_name,
                        user_id: options.userId ?? user.id
                    }
                }
            );
        },
        photo(user, options) {
            return withMessageBase(
                nextUpdateId(),
                user,
                createPrivateChat(user),
                {
                    photo: [
                        {
                            file_id: `${options.fileId}-small`,
                            file_unique_id: `${options.fileId}-small-unique`,
                            width: 90,
                            height: 90,
                            file_size: 1_000
                        },
                        {
                            file_id: options.fileId,
                            file_unique_id: `${options.fileId}-unique`,
                            width: 1280,
                            height: 960,
                            file_size: 100_000
                        }
                    ],
                    ...(options.mediaGroupId === undefined
                        ? {}
                        : { media_group_id: options.mediaGroupId }),
                    ...(options.caption === undefined
                        ? {}
                        : { caption: options.caption })
                }
            );
        },
        myChatMember(user, status, chat = createPrivateChat(user)) {
            const bot: User = {
                id: BOT_USER_ID,
                is_bot: true,
                first_name: 'Wishlist',
                username: 'wishlist_test_bot'
            };

            return {
                update_id: nextUpdateId(),
                my_chat_member: {
                    chat,
                    from: user,
                    date: TEST_MESSAGE_DATE,
                    old_chat_member: { status: 'member', user: bot },
                    new_chat_member: { status, user: bot }
                }
            } as unknown as Update;
        },
        editedMessage(user, text) {
            const updateId = nextUpdateId();

            return {
                update_id: updateId,
                edited_message: {
                    message_id: updateId,
                    date: TEST_MESSAGE_DATE,
                    edit_date: TEST_MESSAGE_DATE + 1,
                    chat: createPrivateChat(user),
                    from: user,
                    text
                }
            } as unknown as Update;
        },
        withUpdateId(update, updateId) {
            return { ...update, update_id: updateId } as Update;
        }
    };
};
