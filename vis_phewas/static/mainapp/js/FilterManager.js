import {clickAllCategories, closeInfoContainer} from "./utils";
import DOMPurify                                from "dompurify";

/**
 * Class to manage filter functionality
 */
export class FilterManager {
  /**
   * Constructor to initialize the FilterManager
   * @param {Function} adjustSigmaContainerHeight - Function to adjust the height of the sigma container
   * @param {Function} showAlert - Function to show alert messages
   * @param {Function} fetchGraphData - Function to fetch graph data
   * @param {Object} sigmaInstance - Instance of the Sigma graph
   * @param {Object} GraphManager - Instance of the GraphManager
   */
  constructor(
    adjustSigmaContainerHeight,
    showAlert,
    fetchGraphData,
    sigmaInstance,
    GraphManager,
  ) {
    this.filterCount = 0;
    this.filters = [];
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    this.showAlert = showAlert;
    this.fetchGraphData = fetchGraphData;
    this.sigmaInstance = sigmaInstance;
    this.setEventListeners();
    this.graphManager = GraphManager;
  }

  /**
   * Method to set event listeners for toolbar buttons
   */
  setEventListeners = () => {
    const toggleButton = document.querySelector(".toggle-button");
    toggleButton.addEventListener("click", this.hideFilters);
  };

  /**
   * Method to update button states
   */
  updateButtonStates = () => {
    const addFilterButton = document.querySelector(".addFilter");
    addFilterButton.disabled = this.filterCount >= 8;
  };

  /**
   * Method to push filters to the filters array
   */
  pushFilters = () => {
    // Clear the filters array and get all filter groups from frontend
    this.filters = [];
    const filterGroups = document.querySelectorAll(".filter-group");

    // Iterate over each filter group and push the filter to the filters array
    filterGroups.forEach((group, index) => {
      const select = group.querySelector("select.field-select");
      const operatorSelect = group.querySelector(".operator-select");
      const input = group.querySelector(".field-input");
      const logicalOperator = group.querySelector(".logical-operator");

      // If the input is empty, skip the filter
      if (input.value === "") {
        return;
      }

      // Sanitize values
      const sanitizedSelectValue = DOMPurify.sanitize(select.value);
      const sanitizedOperatorValue = operatorSelect
        ? DOMPurify.sanitize(operatorSelect.value)
        : "==";
      const sanitizedInputValue = DOMPurify.sanitize(input.value.toLowerCase());

      // Construct the filter string
      if (select && input) {
        const filter = `${sanitizedSelectValue}:${sanitizedOperatorValue}:${sanitizedInputValue}`;
        // If the filter is not the first filter, add the logical operator
        if (index > 0 && logicalOperator) {
          this.filters.push(
            `${DOMPurify.sanitize(logicalOperator.value)} ${filter}`,
          );
        } else {
          this.filters.push(filter);
        }
      }
    });

    this.updateButtonStates(); // Update button states after pushing filters
  };

  /**
   * Method to clear filters
   */
  clearFilters = () => {
    document.querySelector(".toggle-button").style.display = "none";
    this.filters = [];
    const filterGroups = document.querySelectorAll(".filter-group");
    filterGroups.forEach((group) => {
      group.remove();
    });
    // Reset the filter count and close the info container
    this.filterCount = 0;
    closeInfoContainer(
      this.adjustSigmaContainerHeight,
      this.graphManager.graph,
      this.sigmaInstance,
    )();
    const toolbar = document.getElementsByClassName("toolbar")[0];
    if (toolbar) {
      toolbar.style.display = "none";
    }
    // Show alert message and fetch graph data
    this.showAlert("Filters cleared. Showing all data.");
    this.fetchGraphData();

    this.updateButtonStates(); // Update button states after clearing filters
  };

  /**
   * Method to update filter input based on the selected field
   * @param {HTMLSelectElement} select - The select element for the field
   */
  updateFilterInput = (select) => {
    const filterInputContainer = select.parentNode.querySelector(
      "#filter-input-container",
    );
    const selectedField = DOMPurify.sanitize(select.value);

    // Clear the filter input container
    filterInputContainer.innerHTML = "";

    // Add the appropriate input based on the selected field

    // If the selected field is a snp, phewas_code, phewas_string, category_string, serotype, or subtype
    if (
      [
        "snp",
        "phewas_code",
        "phewas_string",
        "category_string",
        "serotype",
        "subtype",
      ].includes(selectedField)
    ) {
      // Add an input field
      const operator = document.createElement("select");
      // Sanitize the operator value
      operator.innerHTML = DOMPurify.sanitize(`
        <option value="==">Exactly</option>
        <option value="contains">Contains</option>
      `);
      operator.className = "operator-select";
      filterInputContainer.appendChild(operator); // Append the operator to the filter input container
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Enter value";
      input.className = "field-input";
      filterInputContainer.appendChild(input);
      // If the selected field is cases, controls, p, odds_ratio, l95, u95, or maf
    } else if (
      ["cases", "controls", "p", "odds_ratio", "l95", "u95", "maf"].includes(
        selectedField,
      )
    ) {
      // Add a select field for the operator
      const operator = document.createElement("select");
      // Sanitize the operator value
      operator.innerHTML = DOMPurify.sanitize(`
        <option value=">">> (Greater than)</option>
        <option value="<">< (Less than)</option>
        <option value=">=">>= (Greater than or equal to)</option>
        <option value="<="><= (Less than or equal to)</option>
      `);
      operator.className = "operator-select";
      // Append the operator to the filter input container
      filterInputContainer.appendChild(operator);
      // Add an input field
      const input = document.createElement("input");
      input.type = "number";
      input.placeholder = "Enter value";
      input.className = "field-input";
      filterInputContainer.appendChild(input);
      // If the selected field is gene_class, gene_name
    } else if (["gene_class", "gene_name"].includes(selectedField)) {
      // Add a select field for the operator
      const select = document.createElement("select");
      select.className = "field-input";
      // Sanitize the operator value
      if (selectedField === "gene_class") {
        select.innerHTML = DOMPurify.sanitize(`
          <option value="1">Class 1</option>
          <option value="2">Class 2</option>
        `);
      } else if (selectedField === "gene_name") {
        // Add a select field for the gene name
        select.innerHTML = DOMPurify.sanitize(`
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="DPA1">DPA1</option>
          <option value="DPB1">DPB1</option>
          <option value="DQA1">DQA1</option>
          <option value="DQB1">DQB1</option>
          <option value="DRB1">DRB1</option>
        `);
      }
      // Append the operator to the filter input container
      filterInputContainer.appendChild(select);
    }

    // Adjust the sigma container height so that the graph is not hidden
    this.adjustSigmaContainerHeight();
  };

  /**
   * Method to show/hide filters
   */
  hideFilters = () => {
    this.adjustSigmaContainerHeight();
    console.log("Sigma Adjusted");
    // Get the filter container, filter body, and chevron
    const filterContainer = document.querySelector(".toolbar-wrapper");
    const filterBody = document.querySelector(".toolbar");
    const chevron = document.querySelector(".toggle-button .fa-chevron-down");

    // Check if the filter body is visible
    const isFilterBodyVisible = filterBody.style.display === "block";

    // Toggle the visibility of the filter body and state of the chevron
    filterBody.style.display = isFilterBodyVisible ? "none" : "block";
    filterContainer.style.display = isFilterBodyVisible ? "none" : "block";
    chevron.classList.toggle("up", isFilterBodyVisible);
    chevron.classList.toggle("down", !isFilterBodyVisible);
  };

  /**
   * Method to add a filter
   */
  addFilter = () => {
    // Show the toggle button, filter container, and filter body
    document.querySelector(".toggle-button").style.display = "block";
    const filterContainer = document.querySelector(".toolbar-wrapper");
    filterContainer.style.display = "block";
    const filterBody = document.querySelector(".toolbar");
    const chevron = document.querySelector(".toggle-button .fa-chevron-down");
    filterBody.style.display = "block";
    // Ensure chevron is pointing down
    const isFilterBodyVisible = filterBody.style.display === "block";
    chevron.classList.toggle("up", !isFilterBodyVisible);
    chevron.classList.toggle("down", isFilterBodyVisible);
    // Adjust the sigma container height
    this.adjustSigmaContainerHeight();
    // Check if the maximum number of filters has been reached
    if (this.filterCount >= 8) {
      alert("Maximum of 8 filters allowed");
    } else {
      // Create a new filter group
      const filterGroup = document.createElement("div");
      filterGroup.className = "filter-group";

      // If there is more than one filter, add a logical operator
      if (this.filterCount > 0) {
        const logicalOperator = document.createElement("select");
        // Sanitize the logical operator value
        logicalOperator.className = "logical-operator";
        logicalOperator.innerHTML = DOMPurify.sanitize(`
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        `);
        // Append the logical operator to the filter group
        filterGroup.appendChild(logicalOperator);
      }

      // Add a select field for the field
      const select = document.createElement("select");
      select.className = "field-select";
      select.onchange = () => this.updateFilterInput(select);
      // Sanitize the select value
      select.innerHTML = DOMPurify.sanitize(`
        <option value="snp">SNP</option>
        <option value="gene_class">Gene Class</option>
        <option value="gene_name">Gene Name</option>
        <option value="serotype">Serotype</option>
<!-- If showSubtypes is true, add an option for the subtype-->
        ${window.showSubtypes ? `<option value="subtype">Subtype</option>` : ""}
        <option value="phewas_code">Phecode</option>
        <option value="phewas_string">Phenotype</option>
        <option value="category_string">Disease Category</option>
        <option value="cases">Number of Cases</option>
        <option value="controls">Number of Controls</option>
        <option value="p">P-Value</option>
        <option value="odds_ratio">Odds Ratio</option>
        <option value="l95">95% CI Lower Bound</option>
        <option value="u95">95% CI Upper Bound</option>
        <option value="maf">Minor Allele Frequency</option>
      `);
      filterGroup.appendChild(select);

      // Add a select field for the operator
      const filterInputContainer = document.createElement("div");
      // Sanitize the filter input container id
      filterInputContainer.id = "filter-input-container";
      filterGroup.appendChild(filterInputContainer);

      // Add minus button to remove filter
      const minusButton = document.createElement("button");
      minusButton.className = "btn btn-danger";
      minusButton.textContent = "-";
      // Remove the filter when the minus button is clicked
      minusButton.onclick = () => this.removeFilter(minusButton);
      filterGroup.appendChild(minusButton);

      document.getElementById("filters-container").appendChild(filterGroup);

      // Update the filter count and button states
      this.updateFilterInput(select);
      this.adjustSigmaContainerHeight();

      this.filterCount++;
      this.updateButtonStates(); // Update button states after adding a filter
    }
  };

  /**
   * Method to remove a filter group when button clicked
   * @param {HTMLButtonElement} button - The button element to remove the filter
   */
  removeFilter = (button) => {
    // Remove the filter group when the minus button is clicked
    const filterGroup = button.parentNode;
    filterGroup.remove();
    // Adjust the sigma container height
    this.adjustSigmaContainerHeight();
    // Decrement the filter count
    this.filterCount--;
    // If the filter count is 0, hide the toggle button and toolbar
    if (this.filterCount === 0) {
      document.querySelector(".toggle-button").style.display = "none";
      const toolbar = document.getElementsByClassName("toolbar")[0];
      toolbar.style.display = "none";
    }
    this.updateButtonStates(); // Update button states after removing a filter
  };

  /**
   * Method to apply filters
   */
  applyFilters = () => {
    // Push filters to the filters array
    this.pushFilters();
    // If there are no filters, show an alert message
    if (this.filters.length === 0) {
      this.showAlert("No filters selected. Showing all data.");
      return;
    }
    // Construct the alert message
    const message = `Applying filters: ${this.filters.join(" ")}`;
    this.showAlert(message);

    // Fetch graph data with the filters
    this.fetchGraphData({
      filters: this.filters.join(" "),
      type: "categories",
    });

    const filterBody = document.querySelector(".toolbar");
    filterBody.style.display =
      filterBody.style.display === "none" ? "block" : "none";
    const filterContainer = document.querySelector(".toolbar-wrapper");
    // Toggle the visibility of the filter body and state of the chevron
    filterContainer.style.display =
      filterContainer.style.display === "none" ? "block" : "none";

    // Refresh the sigma instance
    this.sigmaInstance.refresh();
  };

  /**
   * Arrow function for tableSelectFilter
   * @param {Object} table_selection - The table selection object containing field and value
   */
  tableSelectFilter = async (table_selection) => {
    // Clear the filters array
    this.filters = [];
    // Clear the filters container
    this.clearFilters();
    // Push the table selection to the filters array
    this.filters.push(
      `${DOMPurify.sanitize(table_selection.field)}:==:${DOMPurify.sanitize(table_selection.value.toLowerCase())}`,
    );
    // Show an alert message
    this.showAlert(`Selecting from table: ${this.filters.join(", ")}`);
    // Create a new filter group for selection
    const filterGroup = document.createElement("div");
    filterGroup.className = "filter-group";
    const select = document.createElement("select");
    select.className = "field-select";
    select.innerHTML = DOMPurify.sanitize(`
      <option value="${table_selection.field}" selected>${table_selection.field}</option>
    `);
    // Disable the select field
    select.disabled = true;
    // Add the operator select field and disable it
    const operatorSelect = document.createElement("select");
    operatorSelect.className = "operator-select";
    operatorSelect.innerHTML = DOMPurify.sanitize(`
      <option value="==">Exactly</option>
    `);
    operatorSelect.disabled = true;
    // Append the select and operator select fields to the filter group
    filterGroup.appendChild(select);
    filterGroup.appendChild(operatorSelect);
    // Add the filter input container
    const filterInputContainer = document.createElement("div");
    filterInputContainer.id = "filter-input-container";
    const input = document.createElement("input");
    input.type = "text";
    input.value = DOMPurify.sanitize(table_selection.value);
    input.className = "field-input";
    input.disabled = true;
    // Append the input to the filter input container
    filterInputContainer.appendChild(input);
    filterGroup.appendChild(filterInputContainer);
    // Add the minus button to remove the filter
    const minusButton = document.createElement("button");
    // Add the minus button class and text content
    minusButton.className = "btn btn-danger";
    minusButton.textContent = "-";
    minusButton.onclick = () => this.removeFilter(minusButton);
    filterGroup.appendChild(minusButton);
    // Display the toolbar and add the filter group to the filters container
    const toolbar = document.getElementsByClassName("toolbar")[0];
    toolbar.style.display = "block";
    document.getElementById("filters-container").appendChild(filterGroup);
    this.filterCount++; // Increment the filter count
    console.log("Fetching graph data"); // Debugging log

    // Fetch the graph data and wait for it to complete
    await this.fetchGraphData({ filters: this.filters });

    // Show the hide filters button
    document.querySelector(".toggle-button").style.display = "block";

    console.log("Table selection filter applied"); // Debugging log

    // Wait a bit for the graph to update fully
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate a click on all categories after the data fetch and graph refresh are complete
    await clickAllCategories(
      this.graphManager.graph,
      this.sigmaInstance,
      this.graphManager.graphHelper,
      this.fetchGraphData.bind(this), // Bind 'this' to maintain context
      this.adjustSigmaContainerHeight,
      this.graphManager,
    );

    this.updateButtonStates(); // Update button states after table selection
  };
}
