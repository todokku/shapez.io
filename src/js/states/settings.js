import { TextualGameState } from "../core/textual_game_state";
import { formatSecondsToTimeAgo } from "../core/utils";
import { allApplicationSettings } from "../profile/application_settings";
import { T } from "../translations";

export class SettingsState extends TextualGameState {
    constructor() {
        super("SettingsState");
    }

    getStateHeaderTitle() {
        return T.settings.title;
    }

    getMainContentHTML() {
        return `

            <div class="upperLinks">
            ${
                this.app.platformWrapper.getSupportsKeyboard()
                    ? `
                        <button class="styledButton editKeybindings">Keybindings</button>
            `
                    : ""
            }

            <button class="styledButton changelog">Changelog</button>


         </div>


            ${this.getSettingsHtml()}
            <div class="versionbar">
                <div class="buildVersion">${T.global.loading} ...</div>
                <button class="styledButton copyright">Copyright & Licenses</button>
            </div>


        `;
    }

    getSettingsHtml() {
        let lastCategory = null;
        let html = "";
        for (let i = 0; i < allApplicationSettings.length; ++i) {
            const setting = allApplicationSettings[i];

            if (setting.categoryId !== lastCategory) {
                lastCategory = setting.categoryId;
                if (i !== 0) {
                    html += "</div>";
                }
                html += `<strong class="categoryLabel">${T.settings.categories[lastCategory]}</strong>`;
                html += "<div class='settingsContainer'>";
            }

            html += setting.getHtml();
        }
        if (lastCategory) {
            html += "</div>";
        }

        return html;
    }

    renderBuildText() {
        const labelVersion = this.htmlElement.querySelector(".buildVersion");
        const lastBuildMs = new Date().getTime() - G_BUILD_TIME;
        const lastBuildText = formatSecondsToTimeAgo(lastBuildMs / 1000.0);

        const version = T.settings.versionBadges[G_APP_ENVIRONMENT];

        labelVersion.innerHTML = `
            <span class='version'>
                ${G_BUILD_VERSION} @ ${version} @ ${G_BUILD_COMMIT_HASH}
            </span>
            <span class='buildTime'>
                ${T.settings.buildDate.replace("<at-date>", lastBuildText)}<br />
            </span>`;
    }

    onEnter(payload) {
        this.renderBuildText();
        this.trackClicks(this.htmlElement.querySelector(".copyright"), this.onCopyrightClicked, {
            preventDefault: false,
        });
        this.trackClicks(this.htmlElement.querySelector(".changelog"), this.onChangelogClicked, {
            preventDefault: false,
        });

        const keybindingsButton = this.htmlElement.querySelector(".editKeybindings");

        if (keybindingsButton) {
            this.trackClicks(keybindingsButton, this.onKeybindingsClicked, { preventDefault: false });
        }

        this.initSettings();
    }

    initSettings() {
        allApplicationSettings.forEach(setting => {
            const element = this.htmlElement.querySelector("[data-setting='" + setting.id + "']");
            setting.bind(this.app, element, this.dialogs);
            setting.syncValueToElement();
            this.trackClicks(
                element,
                () => {
                    setting.modify();
                },
                { preventDefault: false }
            );
        });
    }

    onCopyrightClicked() {
        // this.moveToStateAddGoBack("CopyrightState");
    }

    onChangelogClicked() {
        // this.moveToStateAddGoBack("ChangelogState");
    }

    onKeybindingsClicked() {
        // this.moveToStateAddGoBack("KeybindingsState");
    }
}
