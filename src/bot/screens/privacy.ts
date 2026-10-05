import {
    homeButton,
    navigationButton,
    optionalUrlButton,
    singleColumnKeyboard
} from '../content/keyboards';
import type { BotRequest, CallbackTable, ScreenModule } from '../runtime/types';

const OTHER_PROJECTS_SEPARATOR = '\n - ';

const renderDescription = (req: BotRequest) => {
    const { description } = req.LL.privacy;
    const projects = description.otherProjects.projects;

    return [
        description.sensitive(),
        description.openSource(),
        description.languages(),
        description.rates(),
        description.feedback(),
        req.LL.feedback.description.points(),
        description.otherProjects.title(),
        `\n\n - ${[
            projects.princess(),
            projects.youtube(),
            projects.telegram()
        ].join(OTHER_PROJECTS_SEPARATOR)}`
    ].join('');
};

const render = async (req: BotRequest) => {
    const { LL, env } = req;
    const { links } = LL.privacy;

    await req.send.text(
        renderDescription(req),
        singleColumnKeyboard([
            optionalUrlButton(links.github(), env.GITHUB_REPO_URL),
            optionalUrlButton(links.princess(), env.PRINCESS_TG_URL),
            optionalUrlButton(links.youtube(), env.YT_CHANNEL),
            optionalUrlButton(links.telegram(), env.TG_CHANNEL),
            optionalUrlButton(links.x(), env.AUTHOR_TWITTER_LINK),
            navigationButton(LL.feedback.title(), 'feedback'),
            homeButton(LL)
        ])
    );
};

export const screen: ScreenModule = {
    id: 'privacy',
    render
};

export const callbacks: CallbackTable = {};
