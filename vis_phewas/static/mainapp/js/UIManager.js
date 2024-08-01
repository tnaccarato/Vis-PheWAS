import { getAdjustSigmaContainer, getExportData, getShowAlert } from "./utils";
import { FilterManager } from "./FilterManager";
import GraphManager from "./GraphManager";
import { fetchAndShowAssociations } from "./associationsPlot";

class UIManager {
  constructor() {
    this.graphManager = new GraphManager(
      "sigma-container",
      this.adjustSigmaContainerHeight.bind(this)
    );
    this.filterManager = new FilterManager(
      this.adjustSigmaContainerHeight.bind(this),
      this.showAlert.bind(this),
      this.graphManager.fetchGraphData.bind(this.graphManager),
      this.graphManager.sigmaInstance
    );

    // Set the filterManager on the window object
    window.filterManager = this.filterManager;

    this.initEventListeners();
  }

  initEventListeners() {
    document.addEventListener("DOMContentLoaded", this.onDOMContentLoaded.bind(this));
    window.updateFilterInput = this.filterManager.updateFilterInput;
    window.addFilter = this.filterManager.addFilter;
    window.removeFilter = this.filterManager.removeFilter;
    window.applyFilters = this.filterManager.applyFilters;
    window.clearFilters = this.filterManager.clearFilters;
    window.fetchAndShowAssociations = fetchAndShowAssociations;

    const toggleButton = document.getElementsByClassName("toggle-button")[0];
    toggleButton.onclick = this.filterManager.hideFilters;

    window.updateShowSubtypes = this.updateShowSubtypes.bind(this);
    window.exportQuery = this.exportQuery.bind(this);
  }

  onDOMContentLoaded() {
    this.graphManager.fetchGraphData();
  }

  adjustSigmaContainerHeight() {
    getAdjustSigmaContainer(document.getElementById("sigma-container"), this.graphManager.sigmaInstance);
  }

  showAlert(message) {
    getShowAlert(message);
  }

  updateShowSubtypes() {
    window.showSubtypes = !window.showSubtypes;
    console.log("Show subtypes:", window.showSubtypes); // Debugging log
    this.graphManager.fetchGraphData();
    this.graphManager.sigmaInstance.refresh();
  }

  exportQuery() {
    getExportData(this.showAlert);
  }
}

const uiManager = new UIManager();
export const filterManager = uiManager.filterManager;
export default uiManager;
