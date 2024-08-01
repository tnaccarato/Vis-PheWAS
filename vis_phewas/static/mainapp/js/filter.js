import { closeInfoContainer } from "./utils";
import DOMPurify from "dompurify";

// Class to manage filter functionality
export class FilterManager {
  // Constructor
  constructor(adjustSigmaContainerHeight, showAlert, fetchGraphData, sigmaInstance) {
    this.filterCount = 0;
    this.filters = [];
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    this.showAlert = showAlert;
    this.fetchGraphData = fetchGraphData;
    this.sigmaInstance = sigmaInstance;
  }

  // Method to push filters to the filters array
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
      console.log("Logical operator:", logicalOperator); // Debugging log

      // If the input is empty, skip the filter
      if (input.value === "") {
        return;
      }

      // Sanitize values
      const sanitizedSelectValue = DOMPurify.sanitize(select.value);
      const sanitizedOperatorValue = operatorSelect ? DOMPurify.sanitize(operatorSelect.value) : "==";
      const sanitizedInputValue = DOMPurify.sanitize(input.value.toLowerCase());

      // Construct the filter string
      if (select && input) {
        const filter = `${sanitizedSelectValue}:${sanitizedOperatorValue}:${sanitizedInputValue}`;
        // If the filter is not the first filter, add the logical operator
        if (index > 0 && logicalOperator) {
          this.filters.push(`${DOMPurify.sanitize(logicalOperator.value)} ${filter}`);
        } else {
          this.filters.push(filter);
        }
      }
    });
  };

  // Method to clear filters
  clearFilters = () => {
    // Clear the filters array and remove all filter groups from frontend
    document.querySelector(".toggle-button").style.display = "none";
    this.filters = [];
    const filterGroups = document.querySelectorAll(".filter-group");
    filterGroups.forEach((group) => {
      group.remove();
    });
    // Reset the filter count and close the info container
    this.filterCount = 0;
    closeInfoContainer(this.adjustSigmaContainerHeight)();
    const toolbar = document.getElementsByClassName("toolbar")[0];
    toolbar.style.display = "none";
    // Show alert message and fetch graph data
    this.showAlert("Filters cleared. Showing all data.");
    this.fetchGraphData();
  };

  // Method to update filter input based on the selected field
  updateFilterInput = (select) => {
    const filterInputContainer = select.parentNode.querySelector("#filter-input-container");
    const selectedField = DOMPurify.sanitize(select.value);

    // Clear the filter input container
    filterInputContainer.innerHTML = "";
    console.log("Selected field:", selectedField); // Debugging log

    // Add the appropriate input based on the selected field
    if (["snp", "phewas_code", "phewas_string", "category_string", "serotype", "subtype"].includes(selectedField)) {
      const operator = document.createElement("select");
      operator.innerHTML = DOMPurify.sanitize(`
        <option value="==">Exactly</option>
        <option value="contains">Contains</option>
      `);
      operator.className = "operator-select";
      filterInputContainer.appendChild(operator);
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Enter value";
      input.className = "field-input";
      filterInputContainer.appendChild(input);
    } else if (["cases", "controls", "p", "odds_ratio", "l95", "u95", "maf"].includes(selectedField)) {
      const operator = document.createElement("select");
      operator.innerHTML = DOMPurify.sanitize(`
        <option value=">">> (Greater than)</option>
        <option value="<">< (Less than)</option>
        <option value=">=">>= (Greater than or equal to)</option>
        <option value="<="><= (Less than or equal to)</option>
      `);
      operator.className = "operator-select";
      filterInputContainer.appendChild(operator);
      const input = document.createElement("input");
      input.type = "number";
      input.placeholder = "Enter value";
      input.className = "field-input";
      filterInputContainer.appendChild(input);
    } else if (["gene_class", "gene_name", "a1", "a2"].includes(selectedField)) {
      const select = document.createElement("select");
      select.className = "field-input";
      if (selectedField === "gene_class") {
        select.innerHTML = DOMPurify.sanitize(`
          <option value="1">Class 1</option>
          <option value="2">Class 2</option>
        `);
      } else if (selectedField === "gene_name") {
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
      } else {
        select.innerHTML = DOMPurify.sanitize(`
          <option value="A">A</option>
          <option value="P">P</option>
        `);
      }
      filterInputContainer.appendChild(select);
    }

    // Adjust the sigma container height so that the graph is not hidden
    this.adjustSigmaContainerHeight();
  };

  // Method to show/hide filters
  hideFilters = () => {
    // Get the toggle button, filter container, filter body, and chevron icon
    const toggleButton = document.querySelector(".toggle-button");
    const filterContainer = document.querySelector(".toolbar-wrapper");
    const filterBody = document.querySelector(".toolbar");
    const chevron = toggleButton.querySelector(".fa");

    // Add event listener to the toggle button
    toggleButton.addEventListener("click", () => {
      filterBody.style.display = filterBody.style.display === "none" ? "block" : "none";
      filterContainer.style.display = filterContainer.style.display === "none" ? "block" : "none";
      chevron.classList.toggle("fa-chevron-up");
    });
  };

  // Method to add a filter
  addFilter = () => {
    document.querySelector(".toggle-button").style.display = "block";
    console.log("Filter count:", this.filterCount); // Debugging log
    const filterContainer = document.querySelector(".toolbar-wrapper");
    filterContainer.style.display = "block";
    const filterBody = document.querySelector(".toolbar");
    filterBody.style.display = "block";
    if (this.filterCount >= 8) {
      alert("Maximum of 8 filters allowed");
    } else {
      const filterGroup = document.createElement("div");
      filterGroup.className = "filter-group";

      if (this.filterCount > 0) {
        const logicalOperator = document.createElement("select");
        logicalOperator.className = "logical-operator";
        logicalOperator.innerHTML = DOMPurify.sanitize(`
          <option value="AND">AND</option>
          <option value="OR">OR</option>
        `);
        filterGroup.appendChild(logicalOperator);
      }

      const select = document.createElement("select");
      select.className = "field-select";
      select.onchange = () => this.updateFilterInput(select);
      select.innerHTML = DOMPurify.sanitize(`
        <option value="snp">SNP</option>
        <option value="gene_class">Gene Class</option>
        <option value="gene_name">Gene Name</option>
        <option value="serotype">Serotype</option>
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
        <option value="a1">Allele 1</option>
        <option value="a2">Allele 2</option>
      `);
      filterGroup.appendChild(select);

      const filterInputContainer = document.createElement("div");
      filterInputContainer.id = "filter-input-container";
      filterGroup.appendChild(filterInputContainer);

      const minusButton = document.createElement("button");
      minusButton.className = "btn btn-danger";
      minusButton.textContent = "-";
      minusButton.onclick = () => this.removeFilter(minusButton);
      filterGroup.appendChild(minusButton);

      document.getElementById("filters-container").appendChild(filterGroup);

      this.updateFilterInput(select);

      this.adjustSigmaContainerHeight();

      this.filterCount++;
      console.log(this.filterCount);
    }
  };

  removeFilter = (button) => {
    const filterGroup = button.parentNode;
    filterGroup.remove();

    this.adjustSigmaContainerHeight();
    this.filterCount--;
    if (this.filterCount === 0) {
      document.querySelector(".toggle-button").style.display = "none";
      const toolbar = document.getElementsByClassName("toolbar")[0];
      toolbar.style.display = "none";
    }
  };

  applyFilters = () => {
    this.pushFilters();
    if (this.filters.length === 0) {
      this.showAlert("No filters selected. Showing all data.");
      return;
    }
    const message = `Applying filters: ${this.filters.join(" ")}`;
    this.showAlert(message);

    console.log("Filters:", this.filters);

    this.fetchGraphData({ type: "initial", filters: this.filters.join(" ") });

    const filterBody = document.querySelector(".toolbar");
    filterBody.style.display = filterBody.style.display === "none" ? "block" : "none";
    const filterContainer = document.querySelector(".toolbar-wrapper");
    filterContainer.style.display = filterContainer.style.display === "none" ? "block" : "none";

    this.sigmaInstance.refresh();
  };

  // Arrow function for tableSelectFilter
  tableSelectFilter = (table_selection) => {
    console.log("Table selection:", table_selection);
    this.filters = [];
    this.clearFilters();
    this.filters.push(
      `${DOMPurify.sanitize(table_selection.field)}:==:${DOMPurify.sanitize(table_selection.value.toLowerCase())}`,
    );
    this.showAlert(`Selecting from table: ${this.filters.join(", ")}`);
    const filterGroup = document.createElement("div");
    filterGroup.className = "filter-group";
    const select = document.createElement("select");
    select.className = "field-select";
    select.innerHTML = DOMPurify.sanitize(`
      <option value="${table_selection.field}" selected>${table_selection.field}</option>
    `);
    select.disabled = true;
    const operatorSelect = document.createElement("select");
    operatorSelect.className = "operator-select";
    operatorSelect.innerHTML = DOMPurify.sanitize(`
      <option value="==">Exactly</option>
    `);
    operatorSelect.disabled = true;
    filterGroup.appendChild(select);
    filterGroup.appendChild(operatorSelect);
    const filterInputContainer = document.createElement("div");
    filterInputContainer.id = "filter-input-container";
    const input = document.createElement("input");
    input.type = "text";
    input.value = DOMPurify.sanitize(table_selection.value);
    input.className = "field-input";
    input.disabled = true;
    filterInputContainer.appendChild(input);
    filterGroup.appendChild(filterInputContainer);
    const minusButton = document.createElement("button");
    minusButton.className = "btn btn-danger";
    minusButton.textContent = "-";
    minusButton.onclick = () => this.removeFilter(minusButton);
    filterGroup.appendChild(minusButton);
    const toolbar = document.getElementsByClassName("toolbar")[0];
    toolbar.style.display = "block";
    document.getElementById("filters-container").appendChild(filterGroup);
    this.filterCount++;
    this.fetchGraphData({ type: "initial", filters: this.filters });
    this.sigmaInstance.refresh();
  };
}
