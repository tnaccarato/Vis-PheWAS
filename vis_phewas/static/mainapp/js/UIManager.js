import { getAdjustSigmaContainer, getExportData, getShowAlert } from "./utils";
import { FilterManager } from "./FilterManager";
import GraphManager from "./GraphManager";
import { fetchAndShowAssociations } from "./associationsPlot";

class UIManager {
  /**
   * Constructor for the UIManager class.
   * Initializes the GraphManager and FilterManager instances and sets up event listeners.
   */
  constructor() {
    this.graphManager = new GraphManager(
      "sigma-container",
      this.adjustSigmaContainerHeight.bind(this)
    );
    this.filterManager = new FilterManager(
      this.adjustSigmaContainerHeight.bind(this),
      this.showAlert.bind(this),
      this.graphManager.fetchGraphData.bind(this.graphManager),
      this.graphManager.sigmaInstance,
      this.graphManager
    );

    // Set the filterManager on the window object
    window.filterManager = this.filterManager;

    this.initEventListeners();
  }

  /**
   * Initializes event listeners for the UIManager.
   */
  initEventListeners() {
    document.addEventListener("DOMContentLoaded", this.onDOMContentLoaded.bind(this));
    window.updateFilterInput = this.filterManager.updateFilterInput;
    window.addFilter = this.filterManager.addFilter;
    window.removeFilter = this.filterManager.removeFilter;
    window.applyFilters = this.filterManager.applyFilters;
    window.clearFilters = this.filterManager.clearFilters;
    window.fetchAndShowAssociations = fetchAndShowAssociations;
    window.updateShowSubtypes = this.updateShowSubtypes.bind(this);
    window.exportQuery = this.exportQuery.bind(this);
  }

  /**
   * Event handler for the DOMContentLoaded event.
   * Fetches the initial graph data.
   */
  onDOMContentLoaded() {
    this.graphManager.fetchGraphData();
  }

  /**
   * Adjusts the height of the Sigma container.
   */
  adjustSigmaContainerHeight() {
    getAdjustSigmaContainer(document.getElementById("sigma-container"), this.graphManager.sigmaInstance);
  }

  /**
   * Displays an alert with the given message.
   * @param {string} message - The message to display in the alert.
   */
  showAlert(message) {
    getShowAlert(message);
  }

  /**
   * Toggles the display of subtypes and refreshes the graph data.
   */
  updateShowSubtypes() {
    window.showSubtypes = !window.showSubtypes;
    console.log("Show subtypes:", window.showSubtypes); // Debugging log
    this.graphManager.fetchGraphData();
    this.graphManager.sigmaInstance.refresh();
  }

  /**
   * Exports the current query data.
   */
  exportQuery() {
    getExportData(this.showAlert);
  }
}

// Initialize the UIManager instance and export the filterManager and uiManager.
const uiManager = new UIManager();
export const filterManager = uiManager.filterManager;