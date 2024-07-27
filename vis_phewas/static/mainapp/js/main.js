import Graph from "graphology";
import { Sigma } from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import {
  getAddFilter,
  getApplyFilters,
  getClearFilters,
  getRemoveFilter,
  getUpdateFilterInput,
  hideFilters,
  tableSelectFilter,
} from "./filter";
import {
  closeInfoContainer,
  getAdjustSigmaContainer,
  getExportData,
  getShowAlert,
} from "./utils";
import {
  calculateBorder,
  calculateNodeColor,
  clickedNode,
  getApplyLayout,
  hoverOffNode,
  hoverOnNode,
} from "./graph";
import { fetchAndShowAssociations } from "./associationsPlot";

// Ensure the DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Get DOM elements
  const container = document.getElementById("sigma-container");
  const graph = new Graph({ multi: true });
  const sigmaInstance = new Sigma(graph, container, {
    allowInvalidContainer: true,
    labelRenderedSizeThreshold: 300,
    defaultNodeType: "bordered",
    nodeProgramClasses: {
      bordered: createNodeBorderProgram({
        borders: [
          {
            size: { attribute: "borderSize", defaultValue: 0.5 },
            color: { attribute: "borderColor" },
          },
          { size: { fill: true }, color: { attribute: "color" } },
        ],
      }),
    },
  });
  window.updateFilterInput = getUpdateFilterInput(adjustSigmaContainerHeight);
  window.addFilter = getAddFilter(adjustSigmaContainerHeight);
  window.removeFilter = getRemoveFilter(adjustSigmaContainerHeight);
  window.fetchAndShowAssociations = fetchAndShowAssociations;

  function adjustSigmaContainerHeight() {
    getAdjustSigmaContainer(container, sigmaInstance);
  }

  window.applyFilters = getApplyFilters(
    showAlert,
    fetchGraphData,
    sigmaInstance,
  );
  window.clearFilters = getClearFilters(
    adjustSigmaContainerHeight,
    showAlert,
    fetchGraphData,
  );

  const toggleButton = document.getElementsByClassName("toggle-button")[0];

  toggleButton.onclick = hideFilters;

  // Function to update global variable show_subtypes
  function updateShowSubtypes() {
    showSubtypes = !showSubtypes;
    console.log("Show subtypes:", showSubtypes); // Debugging log
    // Update the graph data with the new show_subtypes value
    fetchGraphData();
    sigmaInstance.refresh();
  }

  window.updateShowSubtypes = updateShowSubtypes;

  // Fetch the graph data on page load
  fetchGraphData();

  // Function to fetch graph data from the API
  function fetchGraphData(params = {}) {
    // Add the show_subtypes parameter to the params object
    params.show_subtypes = showSubtypes;

    const query = new URLSearchParams(params).toString();
    const url = "/api/graph-data/" + (query ? "?" + query : "");

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        if (params.type) {
          updateGraph(data.nodes, data.edges, data.visible, params.clicked);
        } else {
          initializeGraph(data.nodes, data.edges, data.visible);
        }
      })
      .catch((error) => console.error("Error loading graph data:", error));
  }

  // Function to initialize the graph
  function initializeGraph(nodes, edges, visible) {
    const container = document.getElementById("sigma-container");

    // Calculate center and radius based on container dimensions
    const centerX = container.offsetWidth / 2;
    const centerY = container.offsetHeight / 2;
    const radius = Math.min(centerX, centerY) - 100; // Adjusting radius to ensure nodes don't touch the edges

    // Clear any existing graph data
    graph.clear();

    // Loop through nodes to position them in a circle starting at 12 o'clock
    nodes.forEach((node, nodeNumber) => {
      if ((!node) in visible) {
        return;
      }
      if (!graph.hasNode(node.id)) {
        // Calculate the angle with an offset to start at 12 o'clock
        const angle = (2 * Math.PI * nodeNumber) / nodes.length - Math.PI / 2;
        // Calculate x and y coordinates based on the angle
        const x = centerX + radius * Math.cos(angle);
        const y = centerY - radius * Math.sin(angle); // Inverted y-axis to start at 12 o'clock

        // Get the color of the node based on its node type
        const color = getNodeColor(node);

        // Debugging log to check angles and positions
        // console.log(`Node ${node.id}: angle ${angle} radians, x: ${x}, y: ${y}`);

        // Add node to the graph with calculated positions
        graph.addNode(node.id, {
          label: node.label.replace("HLA_", ""),
          full_label: node.label,
          node_type: node.node_type,
          forceLabel: true, // Force label display for category nodes
          x: x,
          y: y,
          size: 8,
          borderColor: color,
          borderSize: 0,
          hidden: false,
          color: color,
          userForceLabel: false, // Variable to store user preference for label display
        });
      }
    });

    edges.forEach((edge) => {
      if (!graph.hasEdge(edge.id)) {
        graph.addEdge(edge.source, edge.target);
        graph.setEdgeAttribute(edge.source, edge.target, "hidden", false);
        // console.log('Edge:', edge); // Debugging log
      }
    });
  }

  function updateGraph(nodes, edges, visible, clicked) {
    // Get all nodes and edges in the graph
    const graphNodes = graph.nodes();
    const graphEdges = graph.edges();

    if (!clicked) {
      // Hide all nodes and edges
      graphNodes.forEach((node) => {
        graph.setNodeAttribute(node, "hidden", true);
      });
      graphEdges.forEach((edge) => {
        graph.setEdgeAttribute(edge, "hidden", true);
      });

      sigmaInstance.refresh();
    }

    nodes.forEach((node) => {
      if (!graph.hasNode(node.id)) {
        let { color, baseSize, borderSize, borderColor } =
          calculateBorder(node);
        console.log(baseSize)

        graph.addNode(node.id, {
          label: node.label.replace("HLA_", ""),
          full_label: node.label,
          node_type: node.node_type,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: baseSize,
          odds_ratio: node.node_type === "allele" ? node.odds_ratio : null,
          allele_count: node.node_type === "disease" ? node.allele_count : null,
          borderColor: node.node_type === "allele" ? borderColor : color,
          borderSize: borderSize,
          color: color,
          expanded: false,
          userForceLabel: false,
        });
      }
      graph.setNodeAttribute(node.id, "hidden", visible.includes(node.id));
    });

    edges.forEach((edge) => {
      if (!graph.hasEdge(edge.id)) {
        graph.addEdge(edge.source, edge.target, { color: "darkgrey" });
      }
    });

    applyLayout();
  }

  // Function to calculate the color of a node based on its node type
  function getNodeColor(node) {
    return calculateNodeColor(node);
  }

  // Function to apply the layout to the graph
  function applyLayout() {
    getApplyLayout(graph, sigmaInstance);
  }

  function getInfoTable(nodeData) {
    const infoContainer = document.getElementsByClassName("info-container")[0];
    // console.log('Node data:', nodeData); // Debugging log
    const selectedNode = `${nodeData.node_type}-${nodeData.full_label}`;
    // console.log('Selected node:', selectedNode); // Debugging log

    // Get edges connected to the node
    const edges = graph.edges().filter((edge) => {
      const source = graph.source(edge);
      const target = graph.target(edge);
      // console.log(`Edge: ${edge}, Source: ${source}, Target: ${target}`);
      return source === selectedNode || target === selectedNode;
    });
    // console.log('Edges:', edges); // Debugging log

    // Gets the disease nodes connected to the allele node
    const diseaseNodes = edges.map((edge) => {
      return graph.source(edge) === selectedNode
        ? graph.target(edge)
        : graph.source(edge);
    });
    // console.log(diseaseNodes);

    if (diseaseNodes.length === 0) {
      console.error("No disease nodes found.");
      return;
    }

    let currentIndex = 0;

    // Clear the container
    infoContainer.innerHTML = "";

    const closeButton = document.createElement("button");
    closeButton.className = "btn btn-danger";
    closeButton.textContent = "X";
    closeButton.onclick = closeInfoContainer(adjustSigmaContainerHeight);
    infoContainer.appendChild(closeButton);

    const title = document.createElement("h3");
    title.textContent = nodeData.full_label + " Information";
    title.style.textAlign = "center";
    infoContainer.appendChild(title);

    // Add a button to filter all diseases with the allele
    const controlContainer = document.createElement("div");
    controlContainer.style.display = "flex";
    controlContainer.style.justifyContent = "center";
    const filterButton = document.createElement("button");
    filterButton.className = "btn btn-primary";
    filterButton.textContent = "Show All Diseases with Allele";
    filterButton.style.justifyContent = "center";
    filterButton.style.justifySelf = "center";
    filterButton.onclick = () => {
      tableSelectFilter(
        { field: "snp", value: nodeData.full_label },
        fetchGraphData,
        sigmaInstance,
        showAlert,
      );
    };
    controlContainer.appendChild(filterButton);
    infoContainer.appendChild(controlContainer);

    const navContainer = document.createElement("div");
    navContainer.style.display = "flex";
    navContainer.style.justifyContent = "space-between";
    navContainer.style.marginBottom = "10px";
    navContainer.style.alignItems = "center";

    if (diseaseNodes.length > 1) {
      // Add a button to navigate to the previous disease node
      const prevButton = document.createElement("button");
      prevButton.className = "btn btn-secondary";
      prevButton.textContent = "<";
      prevButton.onclick = () => {
        // console.log('Current index:', currentIndex); // Debugging log
        currentIndex =
          (currentIndex - 1 + diseaseNodes.length) % diseaseNodes.length;
        // console.log('Previous index:', currentIndex); // Debugging log
        displayNodeInfo(diseaseNodes[currentIndex]);
      };
      navContainer.appendChild(prevButton);

      // Add a text node to navigate between diseases
      const navText = document.createElement("p");
      navText.style.textAlign = "center";
      navText.style.alignSelf = "center";
      navText.style.fontStyle = "italic";
      navText.style.fontWeight = "bold";
      navText.textContent = "<- Navigate between diseases ->";
      navText.style.margin = "0";

      navContainer.append(navText);

      // Add a button to navigate to the next disease node
      const nextButton = document.createElement("button");
      nextButton.className = "btn btn-secondary";
      nextButton.textContent = ">";
      nextButton.onclick = () => {
        // console.log('Current index:', currentIndex); // Debugging log
        currentIndex = (currentIndex + 1) % diseaseNodes.length;
        // console.log('Next index:', currentIndex); // Debugging log
        displayNodeInfo(diseaseNodes[currentIndex]);
      };
      navContainer.appendChild(nextButton);
    }

    infoContainer.appendChild(navContainer);

    function displayOddsTables(data) {
      const { top_odds, lowest_odds } = data;

      function createOddsTable(oddsData, heading) {
        // Create and append heading
        const oddsHead = document.createElement("h4");
        oddsHead.textContent = heading;
        oddsHead.style.textAlign = "center";
        infoContainer.appendChild(oddsHead);

        // Create the table element
        const table = document.createElement("table");
        table.className =
          "odds-table table table-striped table-bordered table-hover table-sm";

        // Create the header row
        const headerRow = document.createElement("tr");
        const header1 = document.createElement("th");
        header1.textContent = "Disease";
        headerRow.appendChild(header1);
        const header2 = document.createElement("th");
        header2.textContent = "Odds Ratio";
        headerRow.appendChild(header2);
        const header3 = document.createElement("th");
        header3.textContent = "P-Value";
        headerRow.appendChild(header3);
        table.appendChild(headerRow);

        // Unpack the odds object and add each key-value pair as a row in the table
        oddsData.forEach((odds) => {
          const row = document.createElement("tr");
          const diseaseCell = document.createElement("td");
          diseaseCell.textContent = odds.phewas_string;
          row.appendChild(diseaseCell);
          const oddsCell = document.createElement("td");
          oddsCell.textContent = odds.odds_ratio.toString();
          row.appendChild(oddsCell);
          const pValueCell = document.createElement("td");
          pValueCell.textContent = odds.p.toString();
          row.appendChild(pValueCell);
          row.onclick = () => {
            tableSelectFilter(
              {
                field: "phewas_string",
                value: odds.phewas_string,
              },
              fetchGraphData,
              sigmaInstance,
              showAlert,
            );
          };
          table.appendChild(row);
        });

        infoContainer.appendChild(table);
      }

      createOddsTable(top_odds, "Most Affected Diseases");
      createOddsTable(lowest_odds, "Most Mitigated Diseases");
    }

    function displayNodeInfo(diseaseNode) {
      // Clear previous data related to disease info
      const existingDiseaseInfo = infoContainer.querySelector(".disease-info");
      // console.log('Existing disease info:', existingDiseaseInfo); // Debugging log

      // Fetch data from the API for the disease
      const disease = graph.getNodeAttributes(diseaseNode).full_label;
      if (!disease) {
        console.error("Disease is null or undefined");
        return;
      }
      const encodedAllele = encodeURIComponent(nodeData.full_label);
      const encodedDisease = encodeURIComponent(disease);
      // console.log(`Fetching data for allele: ${nodeData.full_label}, disease: ${disease}`); // Log query
      // parameters
      const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

      function updateNodeStyle(nodeData) {
        console.log("Node data", nodeData); // Debugging log
        const alleleNode = `allele-HLA_${nodeData.gene_name}_${nodeData.serotype.toString()}${
          showSubtypes === true ? "" + nodeData.subtype.toString() : ""
        }`;
        const node = graph.getNodeAttributes(alleleNode);

        // Ensure that calculateBorder has the correct data
        node.node_type = "allele";
        node.odds_ratio = nodeData.odds_ratio;
        node.p = nodeData.p;


        // Calculate the color and size of the allele node based on the updated data
        let { color, baseSize, borderSize, borderColor } =
          calculateBorder(node);

        // Update the allele node attributes with the new color and size
        graph.setNodeAttribute(alleleNode, "color", color);
        graph.setNodeAttribute(alleleNode, "borderColor", borderColor);
        graph.setNodeAttribute(alleleNode, "borderSize", borderSize);
        graph.setNodeAttribute(alleleNode, "size", baseSize);

        // Deselect all other disease nodes
        graph.nodes().forEach((node) => {
          if (
            node !== diseaseNode &&
            graph.getNodeAttribute(node, "node_type") === "disease"
          ) {
            graph.setNodeAttribute(
              node,
              "borderColor",
              graph.getNodeAttribute(node, "color"),
            );
            graph.setNodeAttribute(node, "borderSize", 0);
            // Reset force labels for diseases
            if (graph.getNodeAttribute(node, "userForceLabel") === false) {
              graph.setNodeAttribute(node, "forceLabel", false);
            }
          }

          if (
            graph.getNodeAttribute(node, "node_type") === "allele" &&
            node !== alleleNode
          ) {
            // Reset force labels for alleles
            if (graph.getNodeAttribute(node, "userForceLabel") === false) {
              graph.setNodeAttribute(node, "forceLabel", false);
            } else {
              graph.setNodeAttribute(node, "forceLabel", true);
            }
          }
        });

        // Highlight the disease node
        graph.setNodeAttribute(diseaseNode, "borderColor", "black");
        graph.setNodeAttribute(diseaseNode, "borderSize", 0.1);
        graph.setNodeAttribute(diseaseNode, "forceLabel", true);

        sigmaInstance.refresh(); // Refresh the sigma instance to apply changes
      }

      fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          if (data.error) {
            throw new Error(data.error);
          }

          // Create a table for the disease-specific info
          const table = document.createElement("table");
          table.className =
            "disease-info allele-info-table table table-striped table-bordered table-hover table-sm";
          const headerRow = document.createElement("tr");
          const header1 = document.createElement("th");
          header1.textContent = "Field";
          headerRow.appendChild(header1);
          const header2 = document.createElement("th");
          header2.textContent = "Value";
          headerRow.appendChild(header2);
          table.appendChild(headerRow);

          // Loop through the otherData object and add each key-value pair as a row in the table
          Object.entries(data).forEach(([key, value]) => {
            if (key !== "top_odds" && key !== "lowest_odds") {
              const row = document.createElement("tr");
              const cell1 = document.createElement("td");
              cell1.textContent = key;
              row.appendChild(cell1);
              const cell2 = document.createElement("td");
              cell2.textContent = value;
              row.appendChild(cell2);
              // If the key is disease, add a button to show associations for the disease in the Circos
              // plot
              if (key === "phewas_string") {
                const cell3 = document.createElement("td");
                const button = document.createElement("button");
                button.className = "btn btn-primary";
                button.textContent = "Show Combinational Associations";
                button.onclick = () => {
                  fetchAndShowAssociations(value, showSubtypes);
                };
                cell3.appendChild(button);
                row.appendChild(cell3);
              }
              table.appendChild(row);
            }
          });

          infoContainer.style.overflowY = "auto";
          // If there is existing disease info, replace it with the new table and update the allele with
          // new color and size from the data
          if (existingDiseaseInfo) {
            existingDiseaseInfo.replaceWith(table);
          }
          // Otherwise, append the new table to the container
          else {
            infoContainer.appendChild(table);
          }
          // Update the allele node attributes with the data from the API
          updateNodeStyle(data);
        })
        .catch((error) => {
          console.error("Error loading disease info:", error);
          const errorMessage = document.createElement("div");
          errorMessage.className = "disease-info alert alert-danger";
          errorMessage.textContent = `Error loading disease info: ${error.message}`;
          infoContainer.appendChild(errorMessage);
        });
    }

    // Display the initial node info
    displayNodeInfo(diseaseNodes[currentIndex]);

    // Fetch and display the odds data (common for all disease nodes)
    const encodedAllele = encodeURIComponent(nodeData.full_label);
    const encodedDisease = encodeURIComponent(
      graph.getNodeAttributes(diseaseNodes[currentIndex]).full_label,
    );
    const url = `/api/get-info/?allele=${encodedAllele}&disease=${encodedDisease}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }

        displayOddsTables(data);
      })
      .catch((error) => {
        console.error("Error loading allele info:", error);
        const errorMessage = document.createElement("div");
        errorMessage.className = "alert alert-danger";
        errorMessage.textContent = `Error loading allele info: ${error.message}`;
        infoContainer.appendChild(errorMessage);
      });
  }

  sigmaInstance.on("clickNode", ({ node }) => {
    clickedNode(
      graph,
      node,
      fetchGraphData,
      adjustSigmaContainerHeight,
      getInfoTable,
    );
  });

  sigmaInstance.on("enterNode", ({ node }) => {
    hoverOnNode(node, graph, sigmaInstance);
  });

  // Event listener for when a node hover ends
  sigmaInstance.on("leaveNode", ({ node }) => {
    hoverOffNode(node, graph, sigmaInstance);
  });

  // Show/Hide labels when right-clicking a node
  sigmaInstance.on("rightClickNode", ({ node }) => {
    const nodeAttributes = graph.getNodeAttributes(node);
    const forceLabel = nodeAttributes.forceLabel;
    graph.setNodeAttribute(node, "forceLabel", !forceLabel);
    graph.setNodeAttribute(node, "userForceLabel", !forceLabel);
    console.log("Force label:", !forceLabel); // Debugging log
    console.log("User force label:", !forceLabel); // Debugging
    sigmaInstance.refresh();
  });

  document
    .getElementById("sigma-container")
    .addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });

  // Exports the current query to a CSV file
  window.exportQuery = function () {
    getExportData(showAlert);
  };

  // Function to show an alert message
  function showAlert(message) {
    getShowAlert(message);
  }
});
