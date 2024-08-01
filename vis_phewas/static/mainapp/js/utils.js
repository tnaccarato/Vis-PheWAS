import {filterManager} from "./main.js";
import { scaleLog }    from "d3-scale";
import * as d3 from "d3";

export function closeInfoContainer(adjustSigmaContainerHeight) {
  return function () {
    const leftColumn = document.getElementsByClassName(
      "col-md-6 left-column",
    )[0];
    leftColumn.style.width = "100%";
    // Resize the Sigma container
    adjustSigmaContainerHeight();
    const rightColumn = document.getElementsByClassName(
      "col-md-6 right-column",
    )[0];
    rightColumn.style.display = "none";
    const infoPanel = document.getElementsByClassName("info-container")[0];
    infoPanel.style.display = "none";
  };
}

export function getExportData(showAlert) {
  // Push filters to the filters array to make sure the filters are applied
  filterManager.pushFilters();
  console.log("Filters:", filterManager.filters); // Debugging log

  // If filters is empty, set it to an empty array
  if (!filterManager.filters) {
    filterManager.filters = [];
  }

  // Construct the query string
  const query = new URLSearchParams({ filters: filterManager.filters }).toString();
  // Construct the URL from which to fetch the data
  const url = "/api/export-query/" + (query ? "?" + query : "");

  // Fetch the data from the URL
  fetch(url)
    // Get the response as a blob
    .then((response) => {
      console.log(url);
      // Get the dataset length from the response headers
      const length = response.headers.get("Dataset-Length");
      if (length === "0") {
        showAlert("No data to export");
        return;
      }
      // Construct the alert message
      const filtersDisplay = filterManager.filters.length > 0 ? filterManager.filters.join(", ") : "None";
      const alertMessage = `Exporting Data...<br><b>Filters selected:</b> ${filtersDisplay}<br><b>Dataset length:</b> ${length}`;
      showAlert(alertMessage);
      // Return the response as a blob object
      return response.blob();
    })
    // Convert the blob to a URL and download the file
    .then((blob) => {
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "exported_data.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    // Log any errors to the console
    .catch((error) => console.error("Error:", error));
}

export function getShowAlert(message) {
  // Get the alert container
  const alertContainer = document.getElementById("alert-container");
  // Set the inner HTML of the alert container
  alertContainer.innerHTML = `
        <div class="alert alert-info alert-dismissible fade show" role="alert" style="margin: 0">
            ${message}
            <button type="button" class="btn-close align-center" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;
}

export function getAdjustSigmaContainer(container, sigmaInstance) {
  const filtersContainer = document.getElementById("filters-container");
  const filtersHeight = filtersContainer.offsetHeight;

  container.style.height = `calc(100% - ${filtersHeight}px)`;
  sigmaInstance.refresh();
}

// Create a scale for the size of the nodes
export const sizeScale = scaleLog().domain([0.00001, 0.05]).range([8, 2]);

// Sets the color of the disease nodes based on how many alleles are associated with the disease
export const diseaseColor = scaleLog()
  .domain([1, 38])
  .range([d3.rgb("#eafa05"), d3.rgb("#fa6011")]); // Range from yellow to orange

// Function to clamp values within the domain range for the scale to avoid outlying values
export function clamp(value, domain) {
  return Math.max(domain[0], Math.min(domain[domain.length - 1], value));
}


