const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const Wish = require('../models/wish');
const { Markup } = require('telegraf');
const { setTimer } = require('./timer');
const { getTime, getDate, getCurrency } = require('./intl');
const { WISHLIST } = require('../wizard/types');
const getUsername = require('./username');
const { onUnknownError } = require('./on-unknown-error');
const { getCutText, textLimitTypes } = require('./cut-text');
const User = require('../models/user');

const createAccount = async (ctx, user) => {
    const url = new URL('https://api.telegra.ph/createAccount');
    const params = {
        short_name: user.username,
        author_name: getUsername(ctx.update.callback_query.from, 'name'),
        author_url: `https://t.me/${user.username}`
    };

    url.search = new URLSearchParams(params).toString();

    const response = await fetch(url.toString());

    if (!response.ok) {
        await ctx.sendMessage(
            ctx.session.messages.errors.unknown,
            Markup.removeKeyboard()
        );

        return await setTimer(ctx, WISHLIST);
    }

    const data = await response.json();

    await ctx.session.user.updateOne({
        telegraphAccessToken: data.result.access_token
    });

    ctx.session.user = await User.findById(user._id);
};

const domToNode = domNode => {
    if (domNode.nodeType === domNode.TEXT_NODE) {
        return domNode.data;
    }
    if (domNode.nodeType !== domNode.ELEMENT_NODE) {
        return false;
    }

    const nodeElement = {};

    nodeElement.tag = domNode.tagName.toLowerCase();

    for (let index = 0; index < domNode.attributes.length; index++) {
        const attr = domNode.attributes[index];

        if (attr.name === 'href' || attr.name === 'src') {
            if (!nodeElement.attrs) {
                nodeElement.attrs = {};
            }

            nodeElement.attrs[attr.name] = attr.value;
        }
    }

    if (domNode.childNodes.length > 0) {
        nodeElement.children = [];
        for (let index = 0; index < domNode.childNodes.length; index++) {
            const child = domNode.childNodes[index];

            nodeElement.children.push(domToNode(child));
        }
    }
    return nodeElement;
};

const markdownToHtml = (text, escapeSpaces = true) => {
    if (escapeSpaces) {
        text = text.replace(/\n/g, '');
    }

    return text
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
        .replace(
            /((?:https?|ftp):\/\/[^\s\/$.?#].[^\s]*|www\.[^\s\/$.?#].[^\s]*)/g,
            '<a href="$1">$1</a>'
        );
};

// https://telegra.ph/api#NodeElement
const getHtmlLayout = async (ctx, wishlist, debug) => {
    try {
        let result = '';

        if (debug) {
            console.log(wishlist);
        }

        if (ctx.session.user.payments) {
            result += `<blockquote>`;
            result += markdownToHtml(
                ctx.session.messages.share.payments.replace(
                    '%1',
                    ctx.session.user.payments
                ),
                false
            );
            result += `</blockquote>`;
        }

        for await (const wish of wishlist) {
            const {
                title,
                price,
                description,
                link,
                priority,
                createdAt,
                updatedAt
            } = wish;
            const created = getDate(ctx, createdAt);
            const updated = getDate(ctx, updatedAt);

            result += `<h3>${getCutText(title)}</h3>`;

            if (price > 0) {
                result += `<p>${markdownToHtml(
                    ctx.session.messages.markup.price.replace(
                        '%1',
                        getCurrency(ctx, price)
                    ),
                    true
                )}</p>`;
            }

            if (description) {
                result += `<p>${markdownToHtml(
                    getCutText(description, textLimitTypes.DESCRIPTION),
                    false
                )}</p>`;
            }

            if (priority) {
                result += `<blockquote>${markdownToHtml(
                    ctx.session.messages.markup.priority.owner.replace('> ', '')
                )}</blockquote>`;
            }

            if (link) {
                result += `<p><a href="${link}" title="${title}">${link}</a></p>`;
            }

            result += `<p>${markdownToHtml(
                ctx.session.messages.markup.date.created.replace('%1', created)
            )}</p>`;

            if (created !== updated) {
                result += `<p>${markdownToHtml(
                    ctx.session.messages.markup.date.updated.replace(
                        '%1',
                        updated
                    )
                )}</p>`;
            }

            result += `<hr/>`;
        }

        result += `<aside>`;
        result += `<a href="${process.env.WISHLIST_BOT_URL}">${ctx.session.messages.title}</a>`;
        result += `</aside>`;

        const { services } = ctx.session.messages.donate;

        if (services?.length) {
            result += `<aside>`;

            for await (const [index, { id, title }] of services.entries()) {
                if (!(id in process.env)) continue;

                const divider = index === services.length - 1 ? '' : ' • ';

                result += `<a href="${process.env[id]}">${title}</a>${divider}`;
            }

            result += `</aside>`;
        }

        return `<article id="article">${result}</article>`;
    } catch (e) {
        throw e;
    }
};

const createPage = async (
    ctx,
    wishlist,
    debug = process.env.NODE_ENV !== 'production',
    stop = false
) => {
    try {
        const html = await getHtmlLayout(ctx, wishlist, debug);

        if (debug) {
            console.log(html);

            if (stop) {
                return this;
            }
        }

        const { document } = new JSDOM(html).window;
        const content = domToNode(document.getElementById('article')).children;
        const { telegraphAccessToken, username } = ctx.session.user;
        const name = getUsername(ctx.update.callback_query.from, 'name');
        const url = new URL('https://api.telegra.ph/createPage');
        const params = {
            access_token: telegraphAccessToken,
            short_name: username,
            author_name: getUsername(ctx.update.callback_query.from, 'name'),
            author_url: `https://t.me/${username}`,
            title: ctx.session.messages.share.title.replace('%name', name),
            content: JSON.stringify(content)
        };

        // Get request has string limitation. Use POST instead.
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            console.log('Response error time', getTime());
            console.error(response.status, response.statusText);

            if (debug) {
                console.log('response', response);
                console.log('url', url.toString());
            }

            await ctx.sendMessage(
                ctx.session.messages.errors.unknown,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, WISHLIST);
        }

        const data = await response.json();

        await ctx.sendMessage(
            ctx.session.messages.wishlist.share.success.replace(
                '%url',
                data.result.url
            ),
            Markup.inlineKeyboard([
                Markup.button.callback(
                    ctx.session.messages.actions.back,
                    WISHLIST
                )
            ])
        );
    } catch (e) {
        console.log(e);
        throw e;
    }
};

module.exports = async ctx => {
    try {
        const { user } = ctx.session;
        const wishlist = await Wish.find({
            userId: user._id,
            removed: {
                $ne: true
            },
            hidden: {
                $ne: true
            }
        }).sort({
            priority: -1,
            updatedAt: -1
        });

        if (!wishlist.length) {
            await ctx.sendMessage(
                ctx.session.messages.errors.unknown,
                Markup.removeKeyboard()
            );

            return await setTimer(ctx, WISHLIST);
        }

        if (!user.telegraphAccessToken) {
            await createAccount(ctx, user);
        }

        await createPage(ctx, wishlist);
    } catch (e) {
        return await onUnknownError(ctx, e);
    }
};
