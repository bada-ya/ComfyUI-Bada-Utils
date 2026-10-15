/**
 * ComfyUI-QoL-Utils Frontend Master Extension
 * Registers all QoL modules and custom node UI behaviors.
 */
import { app } from "../../scripts/app.js";
import { setupBlankStartup } from "./blank_startup.js";
import { setupCanvasMouseFix } from "./canvas_mouse_fix.js";
import { setupWorkflowOrganizer } from "./workflow_organizer.js";
import { setupLoadImageFixer, healImageNode, healAllImageNodes } from "./load_image_fixer.js";

app.registerExtension({
    name: "ComfyUI.QoL.Utils",

    async init(app) {
        console.log("[ComfyUI-QoL-Utils] Initializing QoL master extension...");
        try {
            setupCanvasMouseFix();
            setupLoadImageFixer();
        } catch (e) {
            console.error("[QoL-Utils] Error setting up QoL extensions:", e);
        }
    },

    async setup(app) {
        try {
            setupBlankStartup();
            setupWorkflowOrganizer();
        } catch (e) {
            console.error("[QoL-Utils] Error during setup:", e);
        }
        console.log("[ComfyUI-QoL-Utils] Extension setup complete. Quality of Life features active.");
    },

    async nodeCreated(node) {
        try {
            healImageNode(node);
        } catch (e) { console.debug("[Bada] ignored:", e); }
    },

    // NOTE:
    // Do NOT hook loadedGraphNode or nodeType.prototype.onConfigure synchronously.
    // ComfyUI's workflow loading restores links and slots in onConnectionsChange.
    // Calling healImageNode synchronously during configure triggers Impact Pack's
    // "findInputSlot is not a function" error.
    // Instead, safely heal all image nodes AFTER the entire graph configuration is completely finished.
    async afterConfigureGraph() {
        setTimeout(() => {
            try {
                healAllImageNodes();
            } catch (e) { console.debug("[Bada] ignored:", e); }
        }, 300);
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Auto-Error Fixer for LoadImage nodes
        if (nodeData.name === "LoadImage" || nodeData.name === "LoadImageMask" || nodeData.name === "LoadImageOutput") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                try {
                    healImageNode(this);
                } catch (e) { console.debug("[Bada] ignored:", e); }
                return r;
            };
        }
    }
});
