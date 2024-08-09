import { filterManager } from "./main.js";
import { scaleLog } from "d3-scale";
import * as d3 from "d3";

export function closeInfoContainer(
  adjustSigmaContainerHeight,
  graph,
  sigmaInstance,
) {
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
    // For each node in the graph, set forceLabel to userForceLabel
    graph.nodes().forEach((node) => {
      const nodeType = graph.getNodeAttribute(node, "node_type");
      if (nodeType === "allele") {
        graph.setNodeAttribute(node, "forceLabel", true);
      } else if (
        nodeType === "disease" &&
        graph.getNodeAttribute(node, "expanded")
      ) {
        graph.setNodeAttribute(node, "forceLabel", true);
        graph.setNodeAttribute(node, "borderSize", 0);
        graph.setNodeAttribute(
          node,
          "borderColor",
          graph.getNodeAttribute(node, "color"),
        );
      }
    });
    sigmaInstance.refresh();
  };
}

export function getExportData(showAlert) {
  // Push filters to the filters array to make sure the filters are applied
  filterManager.pushFilters();

  // If filters is empty, set it to an empty array
  if (!filterManager.filters) {
    filterManager.filters = [];
  }

  // Construct the query string
  const query = new URLSearchParams({
    filters: filterManager.filters,
  }).toString();
  // Construct the URL from which to fetch the data
  const url = "/api/export-query/" + (query ? "?" + query : "");

  // Fetch the data from the URL
  fetch(url)
    // Get the response as a blob
    .then((response) => {
      // Get the dataset length from the response headers
      const length = response.headers.get("Dataset-Length");
      if (length === "0") {
        showAlert("No data to export");
        return;
      }
      // Construct the alert message
      const filtersDisplay =
        filterManager.filters.length > 0
          ? filterManager.filters.join(", ")
          : "None";
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

// Function to adjust the size of the Sigma container based on the size of the filters container
export function getAdjustSigmaContainer(container, sigmaInstance) {
  const filtersContainer = document.getElementById("filters-container");

  // Using requestAnimationFrame to optimize resizing
  window.requestAnimationFrame(() => {
    const filtersHeight = filtersContainer.offsetHeight;
    const filtersWidth = filtersContainer.offsetWidth;
    container.style.offsetWidth = `${filtersWidth}`;
    container.style.height = `calc(100% - ${filtersHeight}px)`;
    sigmaInstance.refresh();
  });
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

// Function to format the category string to be more readable
export function formatCategoryString(string) {
  return string
    .split("_") // Split the string by underscores
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize the first letter of each word
    .join(" "); // Join the words back together with a space
}

// Simulate clicking every category on the graph
export async function clickAllCategories(
  graph,
  sigmaInstance,
  graphHelperInstance,
  fetchGraphData,
  adjustSigmaContainerHeight,
  graphManager,
) {
  const categories = graph
    .nodes()
    .filter((node) => graph.getNodeAttribute(node, "node_type") === "category");

  console.log(graphManager.visibleNodes);
  if (categories.length > 0) {
    for (const category of categories) {
      if (graphManager.visibleNodes.has(category)) {
        await triggerNodeClick(
          graphHelperInstance,
          graph,
          category,
          fetchGraphData,
          adjustSigmaContainerHeight,
          true,
        );
        // Wait for the graph to finish rendering before clicking the next category
        await new Promise(resolve => setTimeout(resolve, 0));
        sigmaInstance.refresh();
      }
    }
  }

  // After all categories have been clicked, display disease labels
  await displayDiseaseLabels(graph, sigmaInstance);
}

// Display labels for all disease nodes
async function displayDiseaseLabels(graph, sigmaInstance) {
  const diseaseNodes = graph.nodes().filter(
    (node) => graph.getNodeAttribute(node, "node_type") === "disease",
  );
  for (const diseaseNode of diseaseNodes) {
    graph.setNodeAttribute(diseaseNode, "forceLabel", true);
  }
  sigmaInstance.refresh();
}

// Modified triggerNodeClick function
async function triggerNodeClick(
  graphHelperInstance,
  graph,
  nodeId,
  fetchGraphData,
  adjustSigmaContainerHeight,
  allCategories = false,
) {
  console.log("Triggering click for node:", nodeId);
  if (!graph || !nodeId) {
    console.error("Graph or node ID is undefined.");
    return;
  }

  try {
    await graphHelperInstance.clickedNode(
      graph,
      nodeId,
      fetchGraphData,
      adjustSigmaContainerHeight,
      undefined,
      allCategories,
    );
  } catch (error) {
    console.error("Error during clickedNode execution:", error);
  }
}
