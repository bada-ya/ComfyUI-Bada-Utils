/**
 * ComfyUI-QoL-Utils Frontend Master Extension
 * Registers all QoL modules and custom node UI behaviors.
 */
import { app } from "../../scripts/app.js";
import { setupBlankStartup } from "./blank_startup.js";
import { setupCanvasMouseFix } from "./canvas_mouse_fix.js";
import { setupWorkflowOrganizer } from "./workflow_organizer.js";

app.registerExtension({
    name: "ComfyUI.QoL.Utils",

    async init(app) {
        console.log("[ComfyUI-QoL-Utils] Initializing QoL master extension...");
        try {
            setupCanvasMouseFix();
        } catch (e) {
            console.error("[QoL-Utils] Error setting up CanvasMouseFix:", e);
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

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // UI Enhancements for QoL_ShowText node
        if (nodeData.name === "QoL_ShowText") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // Add a smooth, non-blocking text display widget
                const textWidget = this.addWidget("text", "preview", "", () => {}, {
                    multiline: true,
                    readOnly: true
                });
                textWidget.inputEl?.setAttribute("readonly", "true");
                this.size = [320, 180];
                return r;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                if (onExecuted) onExecuted.apply(this, arguments);
                if (message && message.string && message.string.length > 0) {
                    const textWidget = this.widgets?.find(w => w.name === "preview");
                    if (textWidget) {
                        textWidget.value = message.string[0];
                        this.setDirtyCanvas(true, true);
                    }
                }
            };
        }

        // UI Enhancements for QoL_NoteNode
        if (nodeData.name === "QoL_NoteNode") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.color = "#1e1e24";
                this.bgcolor = "#2a2b36";
                this.size = [300, 150];
                return r;
            };
        }
    }
});
