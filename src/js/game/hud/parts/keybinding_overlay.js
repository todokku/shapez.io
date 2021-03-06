import { BaseHUDPart } from "../base_hud_part";
import { makeDiv } from "../../../core/utils";
import { getStringForKeyCode } from "../../key_action_mapper";
import { TrackedState } from "../../../core/tracked_state";
import { queryParamOptions } from "../../../core/query_parameters";
import { T } from "../../../translations";

export class HUDKeybindingOverlay extends BaseHUDPart {
    initialize() {
        this.shiftDownTracker = new TrackedState(this.onShiftStateChanged, this);

        this.root.hud.signals.selectedPlacementBuildingChanged.add(
            this.onSelectedBuildingForPlacementChanged,
            this
        );
    }

    onShiftStateChanged(shiftDown) {
        this.element.classList.toggle("shiftDown", shiftDown);
    }

    createElements(parent) {
        const mapper = this.root.gameState.keyActionMapper;

        const getKeycode = id => {
            return getStringForKeyCode(mapper.getBinding(id).keyCode);
        };

        this.element = makeDiv(
            parent,
            "ingame_HUD_KeybindingOverlay",
            [],
            `
            <div class="binding">
                <code class="keybinding">${getKeycode("center_map")}</code>
                <label>${T.ingame.keybindingsOverlay.centerMap}</label>
            </div>

            <div class="binding">
                <code class="keybinding leftMouse"></code><i></i>
                <code class="keybinding">${getKeycode("map_move_up")}</code>
                <code class="keybinding">${getKeycode("map_move_left")}</code>
                <code class="keybinding">${getKeycode("map_move_down")}</code>
                <code class="keybinding">${getKeycode("map_move_right")}</code>
                <label>${T.ingame.keybindingsOverlay.moveMap}</label>
            </div>               
            
            <div class="binding noPlacementOnly">
                <code class="keybinding rightMouse"></code><i></i>
                <code class="keybinding builtinKey">${T.global.keys.control}</code>+
                <code class="keybinding leftMouse"></code>
                <label>${T.ingame.keybindingsOverlay.removeBuildings}</label>
            </div>
            
            
            <div class="binding placementOnly">
                <code class="keybinding rightMouse"></code><i></i>
                <code class="keybinding">${getKeycode("building_abort_placement")}</code>
                <label>${T.ingame.keybindingsOverlay.stopPlacement}</label>
            </div>

            <div class="binding placementOnly">
                <code class="keybinding">${getKeycode("rotate_while_placing")}</code>
                <label>${T.ingame.keybindingsOverlay.rotateBuilding}</label>
            </div>

            <div class="binding placementOnly">
                <code class="keybinding builtinKey shift">⇧ ${T.global.keys.shift}</code>
                <label>${T.ingame.keybindingsOverlay.placeMultiple}</label>
            </div>

            <div class="binding placementOnly">
                <code class="keybinding builtinKey">${T.global.keys.alt}</code>
                <label>${T.ingame.keybindingsOverlay.reverseOrientation}</label>
            </div>

            <div class="binding placementOnly">
                <code class="keybinding builtinKey">${T.global.keys.control}</code>
                <label>${T.ingame.keybindingsOverlay.disableAutoOrientation}</label>
            </div>
        ` +
                (queryParamOptions.betaMode
                    ? `
            <div class="binding hudToggle">
                <code class="keybinding">F2</code>
                <label>${T.ingame.keybindingsOverlay.toggleHud}</label>
            </div>
        `
                    : "")
        );
    }

    onSelectedBuildingForPlacementChanged(selectedMetaBuilding) {
        this.element.classList.toggle("placementActive", !!selectedMetaBuilding);
    }

    update() {
        this.shiftDownTracker.set(this.root.app.inputMgr.shiftIsDown);
    }
}
