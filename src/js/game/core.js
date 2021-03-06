/* typehints:start */
import { InGameState } from "../states/ingame";
import { Application } from "../application";
/* typehints:end */

import { BufferMaintainer } from "../core/buffer_maintainer";
import { disableImageSmoothing, enableImageSmoothing, registerCanvas } from "../core/buffer_utils";
import { Math_random } from "../core/builtins";
import { globalConfig } from "../core/config";
import { getDeviceDPI, resizeHighDPICanvas } from "../core/dpi_manager";
import { DrawParameters } from "../core/draw_parameters";
import { gMetaBuildingRegistry } from "../core/global_registries";
import { createLogger } from "../core/logging";
import { Vector } from "../core/vector";
import { Savegame } from "../savegame/savegame";
import { SavegameSerializer } from "../savegame/savegame_serializer";
import { AutomaticSave } from "./automatic_save";
import { MetaHubBuilding } from "./buildings/hub";
import { Camera } from "./camera";
import { CanvasClickInterceptor } from "./canvas_click_interceptor";
import { EntityManager } from "./entity_manager";
import { GameSystemManager } from "./game_system_manager";
import { HubGoals } from "./hub_goals";
import { GameHUD } from "./hud/hud";
import { KeyActionMapper } from "./key_action_mapper";
import { GameLogic } from "./logic";
import { MapView } from "./map_view";
import { GameRoot } from "./root";
import { ShapeDefinitionManager } from "./shape_definition_manager";
import { SoundProxy } from "./sound_proxy";
import { GameTime } from "./time/game_time";
import { ProductionAnalytics } from "./production_analytics";
import { randomInt } from "../core/utils";
import { defaultBuildingVariant } from "./meta_building";

const logger = createLogger("ingame/core");

// Store the canvas so we can reuse it later
/** @type {HTMLCanvasElement} */
let lastCanvas = null;
/** @type {CanvasRenderingContext2D} */
let lastContext = null;

/**
 * The core manages the root and represents the whole game. It wraps the root, since
 * the root class is just a data holder.
 */
export class GameCore {
    /** @param {Application} app */
    constructor(app) {
        this.app = app;

        /** @type {GameRoot} */
        this.root = null;

        /**
         * Time budget (seconds) for logic updates
         */
        this.logicTimeBudget = 0;

        /**
         * Time budget (seconds) for user interface updates
         */
        this.uiTimeBudget = 0;

        /**
         * Set to true at the beginning of a logic update and cleared when its finished.
         * This is to prevent doing a recursive logic update which can lead to unexpected
         * behaviour.
         */
        this.duringLogicUpdate = false;

        // Cached
        this.boundInternalTick = this.updateLogic.bind(this);
    }

    /**
     * Initializes the root object which stores all game related data. The state
     * is required as a back reference (used sometimes)
     * @param {InGameState} parentState
     * @param {Savegame} savegame
     */
    initializeRoot(parentState, savegame) {
        // Construct the root element, this is the data representation of the game
        this.root = new GameRoot(this.app);
        this.root.gameState = parentState;
        this.root.savegame = savegame;
        this.root.gameWidth = this.app.screenWidth;
        this.root.gameHeight = this.app.screenHeight;

        // Initialize canvas element & context
        this.internalInitCanvas();

        // Members
        const root = this.root;

        // This isn't nice, but we need it right here
        root.gameState.keyActionMapper = new KeyActionMapper(root, this.root.gameState.inputReciever);

        // Init classes
        root.camera = new Camera(root);
        root.map = new MapView(root);
        root.logic = new GameLogic(root);
        root.hud = new GameHUD(root);
        root.time = new GameTime(root);
        root.canvasClickInterceptor = new CanvasClickInterceptor(root);
        root.automaticSave = new AutomaticSave(root);
        root.soundProxy = new SoundProxy(root);

        // Init managers
        root.entityMgr = new EntityManager(root);
        root.systemMgr = new GameSystemManager(root);
        root.shapeDefinitionMgr = new ShapeDefinitionManager(root);
        root.hubGoals = new HubGoals(root);
        root.productionAnalytics = new ProductionAnalytics(root);
        root.buffers = new BufferMaintainer(root);

        // Initialize the hud once everything is loaded
        this.root.hud.initialize();

        // Initial resize event, it might be possible that the screen
        // resized later during init tho, which is why will emit it later
        // again anyways
        this.resize(this.app.screenWidth, this.app.screenHeight);

        if (G_IS_DEV) {
            // @ts-ignore
            window.globalRoot = root;
        }
    }

    /**
     * Initializes a new game, this means creating a new map and centering on the
     * playerbase
     * */
    initNewGame() {
        logger.log("Initializing new game");
        this.root.gameIsFresh = true;
        this.root.map.seed = randomInt(0, 100000);

        gMetaBuildingRegistry.findByClass(MetaHubBuilding).createAndPlaceEntity({
            root: this.root,
            origin: new Vector(-2, -2),
            rotation: 0,
            originalRotation: 0,
            rotationVariant: 0,
            variant: defaultBuildingVariant,
        });
    }

    /**
     * Inits an existing game by loading the raw savegame data and deserializing it.
     * Also runs basic validity checks.
     */
    initExistingGame() {
        logger.log("Initializing existing game");
        const serializer = new SavegameSerializer();

        try {
            const status = serializer.deserialize(this.root.savegame.getCurrentDump(), this.root);
            if (!status.isGood()) {
                logger.error("savegame-deserialize-failed:" + status.reason);
                return false;
            }
        } catch (ex) {
            logger.error("Exception during deserialization:", ex);
            return false;
        }
        this.root.gameIsFresh = false;
        return true;
    }

    /**
     * Initializes the render canvas
     */
    internalInitCanvas() {
        let canvas, context;
        if (!lastCanvas) {
            logger.log("Creating new canvas");
            canvas = document.createElement("canvas");
            canvas.id = "ingame_Canvas";
            canvas.setAttribute("opaque", "true");
            canvas.setAttribute("webkitOpaque", "true");
            canvas.setAttribute("mozOpaque", "true");
            this.root.gameState.getDivElement().appendChild(canvas);
            context = canvas.getContext("2d", { alpha: false });

            lastCanvas = canvas;
            lastContext = context;
        } else {
            logger.log("Reusing canvas");
            if (lastCanvas.parentElement) {
                lastCanvas.parentElement.removeChild(lastCanvas);
            }
            this.root.gameState.getDivElement().appendChild(lastCanvas);

            canvas = lastCanvas;
            context = lastContext;

            lastContext.clearRect(0, 0, lastCanvas.width, lastCanvas.height);
        }

        // globalConfig.smoothing.smoothMainCanvas = getDeviceDPI() < 1.5;
        // globalConfig.smoothing.smoothMainCanvas = true;

        canvas.classList.toggle("smoothed", globalConfig.smoothing.smoothMainCanvas);

        // Oof, use :not() instead
        canvas.classList.toggle("unsmoothed", !globalConfig.smoothing.smoothMainCanvas);

        if (globalConfig.smoothing.smoothMainCanvas) {
            enableImageSmoothing(context);
        } else {
            disableImageSmoothing(context);
        }

        this.root.canvas = canvas;
        this.root.context = context;

        registerCanvas(canvas, context);
    }

    /**
     * Destructs the root, freeing all resources
     */
    destruct() {
        if (lastCanvas && lastCanvas.parentElement) {
            lastCanvas.parentElement.removeChild(lastCanvas);
        }

        this.root.destruct();
        delete this.root;
        this.root = null;
        this.app = null;
    }

    tick(deltaMs) {
        const root = this.root;

        if (root.hud.parts.processingOverlay.hasTasks() || root.hud.parts.processingOverlay.isRunning()) {
            return true;
        }

        // Extract current real time
        root.time.updateRealtimeNow();

        // Camera is always updated, no matter what
        root.camera.update(deltaMs);

        // Perform logic ticks
        this.root.time.performTicks(deltaMs, this.boundInternalTick);

        // Update UI particles
        this.uiTimeBudget += deltaMs;
        const maxUiSteps = 3;
        if (this.uiTimeBudget > globalConfig.physicsDeltaMs * maxUiSteps) {
            this.uiTimeBudget = globalConfig.physicsDeltaMs;
        }
        while (this.uiTimeBudget >= globalConfig.physicsDeltaMs) {
            this.uiTimeBudget -= globalConfig.physicsDeltaMs;
            // root.uiParticleMgr.update();
        }

        // Update analytics
        root.productionAnalytics.update();

        // Update automatic save after everything finished
        root.automaticSave.update();

        return true;
    }

    shouldRender() {
        if (this.root.queue.requireRedraw) {
            return true;
        }
        if (this.root.hud.shouldPauseRendering()) {
            return false;
        }

        // Do not render
        if (!this.app.isRenderable()) {
            return false;
        }

        return true;
    }

    updateLogic() {
        const root = this.root;
        this.duringLogicUpdate = true;

        // Update entities, this removes destroyed entities
        root.entityMgr.update();

        // IMPORTANT: At this point, the game might be game over. Stop if this is the case
        if (!this.root) {
            logger.log("Root destructed, returning false");
            return false;
        }

        root.systemMgr.update();
        // root.particleMgr.update();

        this.duringLogicUpdate = false;

        return true;
    }

    resize(w, h) {
        this.root.gameWidth = w;
        this.root.gameHeight = h;
        resizeHighDPICanvas(this.root.canvas, w, h, globalConfig.smoothing.smoothMainCanvas);
        this.root.signals.resized.dispatch(w, h);
        this.root.queue.requireRedraw = true;
    }

    postLoadHook() {
        logger.log("Dispatching post load hook");
        this.root.signals.postLoadHook.dispatch();

        if (!this.root.gameIsFresh) {
            // Also dispatch game restored hook on restored savegames
            this.root.signals.gameRestored.dispatch();
        }

        this.root.gameInitialized = true;
    }

    draw() {
        const root = this.root;
        const systems = root.systemMgr.systems;

        const taskRunner = root.hud.parts.processingOverlay;
        if (taskRunner.hasTasks()) {
            if (!taskRunner.isRunning()) {
                taskRunner.process();
            }
            return;
        }

        if (!this.shouldRender()) {
            // Always update hud tho
            root.hud.update();
            return;
        }

        // Update buffers as the very first
        root.buffers.update();

        root.queue.requireRedraw = false;

        // Gather context and save all state
        const context = root.context;
        context.save();

        // Compute optimal zoom level and atlas scale
        const zoomLevel = root.camera.zoomLevel;
        const effectiveZoomLevel =
            (zoomLevel / globalConfig.assetsDpi) * getDeviceDPI() * globalConfig.assetsSharpness;

        let desiredAtlasScale = "0.1";
        if (effectiveZoomLevel > 0.75) {
            desiredAtlasScale = "1";
        } else if (effectiveZoomLevel > 0.5) {
            desiredAtlasScale = "0.75";
        } else if (effectiveZoomLevel > 0.25) {
            desiredAtlasScale = "0.5";
        } else if (effectiveZoomLevel > 0.1) {
            desiredAtlasScale = "0.25";
        }

        // Construct parameters required for drawing
        const params = new DrawParameters({
            context: context,
            visibleRect: root.camera.getVisibleRect(),
            desiredAtlasScale,
            zoomLevel,
            root: root,
        });

        if (G_IS_DEV && (globalConfig.debug.testCulling || globalConfig.debug.hideFog)) {
            context.clearRect(0, 0, root.gameWidth, root.gameHeight);
        }

        // Transform to world space
        root.camera.transform(context);

        assert(context.globalAlpha === 1.0, "Global alpha not 1 on frame start");

        // Update hud
        root.hud.update();

        // Main rendering order
        // -----

        root.map.drawBackground(params);
        // systems.mapResources.draw(params);

        if (!this.root.camera.getIsMapOverlayActive()) {
            systems.itemAcceptor.drawUnderlays(params);
            systems.belt.draw(params);
            systems.itemEjector.draw(params);
            systems.itemAcceptor.draw(params);
        }

        root.map.drawForeground(params);
        if (!this.root.camera.getIsMapOverlayActive()) {
            systems.hub.draw(params);
        }

        if (G_IS_DEV) {
            root.map.drawStaticEntities(params);
        }

        // END OF GAME CONTENT
        // -----

        // Finally, draw the hud. Nothing should come after that
        root.hud.draw(params);

        assert(context.globalAlpha === 1.0, "Global alpha not 1 on frame end before restore");

        // Restore to screen space
        context.restore();

        // Draw overlays, those are screen space
        root.hud.drawOverlays(params);

        assert(context.globalAlpha === 1.0, "context.globalAlpha not 1 on frame end");

        if (G_IS_DEV && globalConfig.debug.simulateSlowRendering) {
            let sum = 0;
            for (let i = 0; i < 1e8; ++i) {
                sum += i;
            }
            if (Math_random() > 0.95) {
                console.log(sum);
            }
        }
    }
}
