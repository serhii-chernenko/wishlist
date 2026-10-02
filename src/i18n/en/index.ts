import type { Translation } from '../i18n-types';

const en: Translation = {
    title: 'Wish list ❤️',
    errors: {
        unknown: '🤷 Oops, something went wrong...',
        outdatedButton: 'This button is outdated. Here is the main menu 👇'
    },
    language: {
        title: '🇺🇸 EN | 🇺🇦 UA | 🇵🇱 PL',
        description:
            '🇺🇸 Change a language of the bot interface.\n🇺🇦 Змінити мову для інтерфейсу боту.\n🇵🇱 Zmień język interfejsu bota.\n\n🎲 If you choose the auto mode, a language of bot interface will be the same as it set in Telegram preferences.\n🎲 Якщо обрати автоматичний режим, мова інтерфейсу боту буде така сама, як вказана в налаштуваннях Телеграму.\n🎲 Jeśli wybierzesz tryb automatyczny, język interfejsu bota będzie taki sam jak ustawiony w Telegramie.',
        options: {
            uk: '🇺🇦 Ukrainian | Українська | Ukraiński',
            en: '🇺🇸 English | Англійська | Angielski',
            pl: '🇵🇱 Polish | Польська | Polski',
            auto: '🎲 Auto | Автоматично | Automatycznie'
        },
        names: {
            uk: 'Ukrainian',
            en: 'English',
            pl: 'Polish',
            auto: 'Auto'
        },
        success: '✅ The interface language is now: {0}',
        current: 'Current language: {0}',
        invalid: '❌ Unknown language: {0}\nAvailable options: en, uk, pl, auto'
    },
    actions: {
        home: '🏠 Home',
        back: '🔙 Back',
        open: '🔗 Open',
        edit: '✏️ Edit',
        remove: '❌ Remove',
        clean: '🧹 Clean',
        share: '💌 Share',
        yes: '✅ Yes',
        no: '❌ No',
        more: 'Show more',
        language: '🌐'
    },
    greeting: {
        general: `Hey there!\nHow often do you run into the problem of not knowing what to give someone important to you,\nor not being able to remember what you would like yourself when people ask - "<i>what should I give you?</i>"?\nI don't know about you, but I have this all the time...\nThere is a way out! And not through the window :D\nShare this bot with your family, friends and acquaintances to make life easier for them and for yourself)`,
        guest: `In this bot you can:\n\n❤️ Open your own wish list.\n🎁 See your own <b>I want to give</b> list.\n🔎 Find another person's wish list.\n\n👤 <b>But for that you need to sign up.</b>\n\n🧐 Right now you can tap\n<b>Read more</b> to get more information about the bot and how your data is used.\n\n💬 Or if you run into any trouble, you can tell me about it by tapping <b>Leave feedback</b>`,
        user: 'What would you like to do?'
    },
    privacy: {
        title: '🧐 Read more',
        description: {
            sensitive:
                '<b>Private data</b>\n\nYour phone number is private information of every user!\nIt is used only to let other users find your wish list if they know your number.\nThis bot is open source, and you can check the code on GitHub via the link below.\nThe user database is stored in Cloudflare with solid protection!\nThe bot stores only your username and/or phone number.\nNo first names, no last names, unless you share your wish list yourself: then the bot keeps the name from your Telegram to show it on the public page. When you stop sharing, the name is deleted.\nThanks for caring about this important topic ❤️',
            openSource:
                '\n\n<b>Open source</b>\n\nOpen source means that anyone can\n- help improve the project\n- see how the code is written\n- this project is also licensed under GNU AGPLv3, which means the code can be fully copied for any other project, even a commercial one.',
            languages:
                '\n\n<b>Languages</b>\n\nThe bot speaks English, Ukrainian and Polish.\nYou can change the language with the 🌐 button or the /lang command, and in Auto mode the bot follows the language of your Telegram.\nIf you would like to help with translations into other languages, leave your contact details in the feedback.',
            feedback: '\n\n<b>Leave feedback</b>',
            otherProjects: {
                title: '\n\n<b>Other projects</b>',
                projects: {
                    princess:
                        'A Telegram bot made purely for fun - Princess of the Day.\nIt picks a random member of a community to be the princess of the day and generates a nice greeting ☺️',
                    youtube:
                        'A YouTube channel where I teach programming and share my experience.',
                    telegram:
                        'A Telegram channel made alongside the YouTube one for insights and feedback from the audience.'
                }
            }
        },
        links: {
            github: '🔗 GitHub',
            x: '🔗 X',
            princess: '🔗 Princess of the Day 🇺🇦',
            youtube: '🔗 YouTube',
            telegram: '🔗 Telegram channel'
        }
    },
    feedback: {
        title: '💬 Leave feedback',
        description: {
            title: '💬 Tell me everything you think about the bot)',
            points: '\n\n- how much you like the bot 😅\n- something is broken and needs fixing\n- ideas for improvement\n- you want to help translate the bot into other languages\n\nIf you need a reply, leave your contact details, for example your Telegram username, phone number or email, so I can write to you and help solve the problem.'
        },
        message: '#feedback from {0}\n\n{1}',
        success: 'Thanks for reaching out ☺️\nI will read it as soon as I can!',
        errors: {
            tooLong:
                '❌ That feedback is too long! The maximum is {0} characters.\nPlease shorten it and send it again.'
        }
    },
    auth: {
        title: {
            guest: '👤 Sign up',
            user: '👤 Change visibility'
        },
        description: {
            general: 'How do you want other users to find you?',
            user: '<b>Right now you can be found:</b>\n{0}',
            guest: '\n\n<b>You can change this choice later!</b>',
            username:
                '\n\nAlso, if you choose:\n{username}\nor\n{both},\nthen when you change your username in Telegram settings, it will be updated in the bot database automatically the next time you use the bot.\nSo there is nothing to update after a username change.'
        },
        types: {
            username: '👤 By username only',
            phone: '📱 By phone number only',
            both: '👤 📱 By username and by phone number'
        },
        sendNumber: {
            title: '📱 Send number',
            description: `I need your number to add it to the search database.\nDon't worry, it will be used for search only.\n\nTap the button:\n📱 <b>Send number</b>\nNo need to type the number manually!`
        },
        errors: {
            username: `❌ You don't have a username yet.\nTry adding one in your Telegram settings and come back ;)`,
            phone: `❌ That doesn't look like a phone number, please try again.\nMake sure you tap the <b>Send number</b> button at the bottom near the keyboard instead of typing the number yourself.`,
            foreignContact:
                '❌ That is not your contact.\nTap the <b>Send number</b> button at the bottom near the keyboard to share your own number.'
        },
        success: {
            user: '✅ Your details are updated!',
            guest: '✅ Your details are now in the database!',
            username: '\n👤 People will be able to find you by username:\n@{0}',
            phone: '\n📱 People will be able to find you by phone number:\n{0}',
            both: '\nPeople will be able to find you\n👤 By username: @{0}\n📱 And by phone number: {1}'
        }
    },
    wishlist: {
        title: '❤️ My wish list',
        empty: 'There are no wishes in your wish list yet!\nAdd your first wish to the list.',
        filtered:
            'No wishes found in your wish list with the filter turned on!\nTry turning the filters off.',
        filled: {
            before: '<b>Here is your wish list:</b>',
            after: '❓<b>What would you like to do?</b>\n\n➕ Add a new wish to the list.\n✏️ Edit an existing wish in the list.\n❌ Remove an existing wish from the list.\n🧹 Clean the wish list.\n💌 Share your wishes with others via a link.'
        },
        add: {
            title: '➕ New wish',
            description:
                'Send the title of the new wish in the next message.\nNo more than {0} characters!',
            error: `❌ That doesn't look like a good title!\nTry again.`,
            success: '✅ The new wish was added to your list!'
        },
        edit: {
            description: '✏️ Wish editing menu',
            actions: {
                title: '✏️ Change title',
                addDescription: '✏️ Add description',
                updateDescription: '✏️ Update description',
                addImages: '🌅 Add images',
                updateImages: '🌅 Update images',
                addLink: '🔗 Add link',
                updateLink: '🔗 Update link',
                setPriority: '❗️I really want this',
                unsetPriority: `❗I don't want it that much anymore`,
                hide: '🫣 Hide from others',
                show: '👀 Make visible again',
                addPrice: '💸 Set price',
                updatePrice: '💸 Update price'
            },
            scenes: {
                title: '✏️ Send the new title of the wish.\nNo more than {0} characters!',
                addDescription:
                    '✏️ Add a description to the current wish\nNo more than {0} characters!',
                updateDescription:
                    '✏️ Change the description (no more than {0} characters) or ❌ remove it',
                addImages: '🌅 Add new images (no more than 9)',
                updateImages:
                    '🌅 Add new images (no more than 9), or ❌ remove all the added ones',
                addLink: '🔗 Add a link',
                updateLink: '🔗 Change the link or ❌ remove it',
                addPrice: '💸 Set the price',
                updatePrice: '💸 Update the price or ❌ remove it'
            },
            errors: {
                title: {
                    general: '❌ Invalid title!',
                    link: `❌ The title can't contain a link!`
                },
                description: '❌ Invalid description!',
                removeImages: '❌ There are no images!',
                updateImages: '❌ There are no images in the message!',
                link: '❌ The link must contain an http match!',
                price: '❌ Invalid price!'
            },
            success: {
                title: '✅ The title was updated!',
                removeDescription: '✅ The description was removed!',
                updateDescription: '✅ The description was updated!',
                removeImages: '✅ The images were removed!',
                updateImages: '✅ The images were added!',
                imagesLimit: `ℹ️ Only 9 images were saved: you can't add more to one wish.`,
                removeLink: '✅ The link was removed!',
                updateLink: '✅ The link was updated!',
                priority: '✅ The priority was changed!',
                visibility: '✅ The visibility was changed!',
                removePrice: '✅ The price was removed!',
                updatePrice: '✅ The price was updated!'
            }
        },
        remove: {
            confirm:
                '❓Was your wish fulfilled (for statistics only, the wish will be removed either way)?',
            success: '✅ The wish was removed!'
        },
        clean: {
            error: '❌ The wish list is already empty!',
            success: '✅ The wish list was cleaned!',
            confirm: `❓<b>Really clean the wish list?</b>\n\nAll wishes will be removed, and they will also disappear from other people's <b>I want to give</b> lists. This can't be undone.`
        },
        share: {
            success: '✅ Here is the link to your wish list:\n{url}',
            empty: '❌ Nothing to share yet: your wish list is empty.\nAdd at least one wish first.',
            consent:
                '🌐 Before you share\n\nThe bot will create a public page of your wish list on {host}. It will show:\n• the name from your Telegram profile: {name}\n• your username, if people can find you by it\n• all your wishes except hidden ones\n• your payment details, if you have added them\n\nAnyone with the link can open the page, and it may appear in search engine results. Your phone number and your "I want to give" list are never shown there.\n\nYou can stop sharing at any time.',
            ready: '✅ Your wish list is available at this link:\n{url}\n\nThe page updates itself after every change to your list.',
            stopConfirm:
                '❓ Stop sharing your wish list?\n\nThe page will stop opening and the saved name will be deleted. If you share again later, the same link will work again, so everyone who has it will see your list again.',
            stopped:
                '✅ Done, you are no longer sharing your wish list.\nThe page at the link no longer opens.',
            newConfirm:
                '❓ Create a new link?\n\nThe old link will stop working right away, and nobody will be able to open your list with it anymore. You will need to send the new link to your friends again.',
            rotated:
                '✅ Here is the new link to your wish list:\n{url}\n\nThe old link no longer works.',
            pageEmpty:
                'ℹ️ The page is empty right now: there are no visible wishes on it. The link works, and wishes will appear on the page as soon as you add them.',
            sendText: 'My wish list ❤️',
            actions: {
                publish: '✅ Share',
                open: '🔗 Open page',
                send: '📤 Send to friends',
                stop: '🚫 Stop sharing',
                newLink: '🔄 New link'
            }
        }
    },
    giveList: {
        title: '🎁 I want to give',
        empty: `There are no wishes in your <b>I want to give</b> list yet!\n🔎 Find another person's wish list to pick a gift.`,
        filled: {
            before: '<b>Here is the list of what you want to give:</b>',
            after: '❓<b>What would you like to do?</b>\n\n❌ Remove an existing wish from the list.\n🧹 Clean the <b>I want to give</b> list'
        },
        givers: '\n\n👥 <i>Others who want to give this too: {0}</i>',
        owner: '\n\n👤 For user: <b>{0}</b>',
        success: {
            remove: '✅ The wish was removed from your <b>I want to give</b> list!',
            clean: '✅ All wishes were removed from your <b>I want to give</b> list!'
        },
        clean: {
            confirm:
                '❓<b>Really clean the I want to give list?</b>\n\nAll the picked wishes will disappear from this list.'
        }
    },
    findList: {
        title: '🔎 Find another wish list',
        description:
            'Try to find a person by username or phone number.\n\nReasons why a person might not be found:\n1. The person has not used the bot.\n2. If you search by phone number and you are sure the number is correct...\nThe person you are looking for may not have wanted to share their number with the bot.\nTry searching by username.\n\n<b>Send the username or phone number of the person in the next message.</b>',
        empty: 'This person has not filled in their wish list yet',
        filtered:
            'No wishes found in this wish list with the filter turned on!\nTry turning the filters off.',
        filled: {
            before: 'Here is the wish list of <b>{0}</b>:',
            payments: `If you can't give a specific gift, the user has shared payment details you can send money to, so they can buy the gift themselves:\n\n{0}`,
            after: `❓<b>What would you like to do?</b>\n\n🎁 Pick a wish to give\n❌ Don't give the picked wish`
        },
        givers: {
            you: '\n\n👥 <i>You want to give this</i>',
            somebodyAndYou:
                '\n\n👥 <i>Already want to give this - you and also: {0}</i>',
            somebody: '\n\n👥 <i>Already want to give this: {0}</i>'
        },
        actions: {
            give: '🎁 Give',
            take: `❌ Don't give`
        },
        errors: {
            give: '❌ This wish is already in your <b>I want to give</b> list!',
            take: '❌ This wish is not in your <b>I want to give</b> list!',
            notFound: '❌ Person not found, please try again!',
            foundYourself: `❌ Nice try, sneaky, but you can't search for yourself! 😘`,
            tooLong:
                '❌ That search is too long! The maximum is {0} characters, please try again.'
        },
        success: {
            give: '✅ The wish was added to your <b>I want to give</b> list!',
            take: '✅ The wish was removed from your <b>I want to give</b> list!'
        }
    },
    donate: {
        title: '💸 Support the author with a donation 🥹👉👈',
        description:
            'The bot will stay free for as long as possible, so that we Ukrainians can give each other gifts.\nThis is very important, this is really needed. Because we are all we have!\n\nBut if you want to support the author, you can do it with the services listed below, or directly via PayPal:\n{paypal}\n\nAnd I will be sincerely grateful ❤️\n\nMost of all donations go to fundraisers for the Armed Forces of Ukraine.\nThe fundraisers and reports can be found in my Telegram channel via the link below.',
        services: {
            monobank: {
                title: '🫙 Monobank'
            },
            kofi: {
                title: '☕️ Ko-fi'
            },
            paypal: {
                title: '💳 PayPal'
            },
            revolut: {
                title: '💸 Revolut'
            }
        }
    },
    stats: {
        action: '📊 Statistics',
        title: '📊 <b>Statistics</b>',
        users: '👤 Active users: <b>{0}</b>',
        wishes: '🎁 Wishes created all time: <b>{0}</b>',
        done: '✅ Wishes fulfilled all time: <b>{0}</b>'
    },
    contacts: {
        telegram: '🔗 Telegram channel'
    },
    share: {
        title: 'Wish list of {name}'
    },
    markup: {
        title: '❤️ <b>{0}</b>',
        description: '\n\n✏️ Description:\n{0}',
        priority: {
            owner: '\n\n<blockquote>❗️ <b>I really want this right now!</b></blockquote>',
            watcher:
                '\n\n<blockquote>❗️ <b>They really want this right now!</b></blockquote>'
        },
        hidden: '\n\n🫣 <i>This wish is hidden from others!</i>',
        price: '\n\n💸 Estimated price: <b>{0}</b>',
        date: {
            created: '\n\n🗓 <i>Created: {0}</i>',
            updated: '\n🗓 <i>Updated: {0}</i>'
        }
    },
    payments: {
        title: {
            add: '💸 Add payment details',
            update: '💸 Update payment details'
        },
        description: {
            add: `Here you can add your own payment details, in case other people who want to give you something from your wish list can't do it and would like to send you money to buy the gifts yourself.\n\nAdd only the details you want other users to see. For example:\n- A Monobank jar\n- A bank card number\n- A PayPal contact\n- A link to Buymeacoffee or similar services.{current}\n\n<b>Send the new payment details in the next message</b>.`,
            update: '<b>Your current payment details:</b>\n{0}'
        },
        edit: {
            error: `❌ That doesn't look like valid information!\nTry again.`,
            success: '✅ The payment details were updated!',
            tooLong:
                '❌ The payment details are too long! The maximum is {0} characters.\nTry again.'
        },
        remove: {
            success:
                '✅ The payment details were removed! You can always come back here to add them again!'
        }
    },
    filters: {
        title: '💰 Filter by price',
        description: 'Show only the wishes that match the given price.',
        applied: '\n\nPrice filter applied:\n<b>{0}</b>',
        fromTo: 'From {0} to {1}',
        from: 'From {0}',
        to: 'Up to {0}',
        reset: '❌ Reset filters',
        success: {
            reset: '✅ The filters were reset!',
            set: '✅ The filter was set!'
        }
    },
    pagination: {
        range: 'Showing {0}-{1} of {2}'
    },
    releases: {
        labels: {
            added: 'Added',
            updated: 'Changed',
            fixed: 'Fixed',
            removed: 'Removed',
            notes: 'Notes'
        },
        announcement: {
            title: 'The bot has been updated to version {version} 🎉',
            footer: 'All changes and previous versions: /releases'
        },
        empty: 'There are no release notes yet.'
    },
    web: {
        header: {
            count: '{count} {{count:wish|wishes}}',
            updated: 'Updated {date}',
            username: 'Telegram: @{username}'
        },
        payments: {
            title: 'Payment details',
            description:
                "If you can't give me a specific gift, you can send money using these details, and I will buy the gift myself."
        },
        wish: {
            priority: 'Really want this',
            price: 'Approximate price: {price}',
            link: 'View on {host}',
            created: 'Created {date}',
            updated: 'Updated {date}'
        },
        empty: 'Nothing here yet. Wishes will appear as soon as they are added to the list.',
        truncated: 'Showing the first {limit} wishes of the list.',
        footer: {
            cta: 'Create your own wish list in the Telegram bot',
            support: 'Support the author',
            openSource: 'Open source on GitHub'
        },
        language: {
            label: 'Language'
        },
        notFound: {
            title: 'Page not found',
            description:
                'The link may contain a typo, or this wish list no longer exists.',
            cta: 'Open the bot'
        },
        gone: {
            title: 'This wish list is no longer shared',
            description:
                'The owner has stopped sharing this page. If they share it again, this link will work again.'
        },
        meta: {
            description:
                '{name}: {count} {{count:wish|wishes}} on the wish list'
        }
    },
    commands: {
        start: 'Main menu',
        lang: 'Change the bot language',
        releases: 'What is new in the bot'
    }
};

export default en;
