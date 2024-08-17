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
      this.adjustSigmaContainerHeight.bind(this),
    );
    this.filterManager = new FilterManager(
      this.adjustSigmaContainerHeight.bind(this),
      this.showAlert.bind(this),
      this.graphManager.fetchGraphData.bind(this.graphManager),
      this.graphManager.sigmaInstance,
      this.graphManager,
    );

    // Set the filterManager on the window object
    window.filterManager = this.filterManager;

    this.initEventListeners();
    this.initShowSubtypes();
  }

  /**
   * Initializes event listeners for the UIManager.
   */
  initEventListeners() {
    document.addEventListener(
      "DOMContentLoaded",
      this.onDOMContentLoaded.bind(this),
    );
    window.updateFilterInput = this.filterManager.updateFilterInput;
    window.addFilter = this.filterManager.addFilter;
    window.removeFilter = this.filterManager.removeFilter;
    window.applyFilters = this.filterManager.applyFilters;
    window.clearFilters = this.filterManager.clearFilters;
    window.fetchAndShowAssociations = fetchAndShowAssociations;
    window.updateShowSubtypes = this.updateShowSubtypes.bind(this);
    window.exportQuery = this.exportQuery.bind(this);
    window.updateCheckboxState = this.updateCheckboxState.bind(this);
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
    getAdjustSigmaContainer(
      document.getElementById("sigma-container"),
      this.graphManager.sigmaInstance,
    );
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
  console.log("showSubtypes before: " + localStorage.getItem("showSubtypes"));
  const showSubtypes = !(localStorage.getItem("showSubtypes") === "true");
  localStorage.setItem("showSubtypes", showSubtypes.toString());
  this.updateCheckboxState();
  console.log("showSubtypes updated to: " + localStorage.getItem("showSubtypes"));
  this.graphManager.fetchGraphData();
  this.graphManager.sigmaInstance.refresh();
}

  updateCheckboxState() {
  const checkbox = document.getElementById('show-subtypes-switch');
  checkbox.checked = localStorage.getItem("showSubtypes") === "true";
}



  initShowSubtypes() {
    let storedState = localStorage.getItem("showSubtypes");
    if (storedState === null) {
      localStorage.setItem("showSubtypes", "false");
    }

    this.updateCheckboxState();
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
