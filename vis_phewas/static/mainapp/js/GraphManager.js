import Graph from "graphology";
import { Sigma } from "sigma";
import { createNodeBorderProgram } from "@sigma/node-border";
import GraphHelper from "./GraphHelper";
import { fetchAndShowAssociations } from "./associationsPlot";
import { closeInfoContainer } from "./utils";

// Main class for managing the graph
class GraphManager {
  /**
   * Constructor for the GraphManager class
   * @param {string} containerId - The ID of the container element
   * @param {Function} adjustSigmaContainerHeight - Function to adjust the height of the sigma container
   */
  constructor(containerId, adjustSigmaContainerHeight) {
    // Get the container element
    this.container = document.getElementById(containerId);
    // Create a new Graph object
    this.graph = new Graph({multi: true});
    // Create a new Sigma instance
    this.sigmaInstance = new Sigma(this.graph, this.container, {
      allowInvalidContainer: true,
      labelRenderedSizeThreshold: 35,
      defaultNodeType: "bordered",
      enableEdgeEvents: true,
      renderEdgeLabels: true,
      // Configure the node program classes
      nodeProgramClasses: {
        bordered: createNodeBorderProgram({
                                            // Define the border program attributes
                                            borders: [
                                              {
                                                size: {attribute: "borderSize", defaultValue: 0.5},
                                                color: {attribute: "borderColor"},
                                              },
                                              {size: {fill: true}, color: {attribute: "color"}},
                                            ],
                                          }),
      },
    });
    // Set the adjustSigmaContainerHeight function
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    // Create a new GraphHelper object for the GraphManager
    this.graphHelper = new GraphHelper(
        this,
        this.sigmaInstance,
        this.adjustSigmaContainerHeight,
    );
    // Initialize the event listeners
    this.initEventListeners();
    this.visibleNodes = new Set();
    this.selectedAlleleNode = null;
    this.selectedDiseaseNode = null;
    // Set the initial camera position of the sigma instance
    this.cameraPosition = null;
  }

  /**
   * Method to initialize the event listeners
   */
  initEventListeners() {
    // Add an event listener for the clickNode event
    this.sigmaInstance.on("clickNode", ({node}) => {
      this.graphHelper.clickedNode(
          this.graph,
          node,
          this.fetchGraphData.bind(this),
          this.adjustSigmaContainerHeight,
          this.getInfoTable.bind(this),
      );
    });

    // Add an event listener for hovering over a node
    this.sigmaInstance.on("enterNode", ({node}) => {
      this.graphHelper.hoverOnNode(node, this.graph, this.sigmaInstance);
    });

    // Add an event listener for leaving a node
    this.sigmaInstance.on("leaveNode", ({node}) => {
      this.graphHelper.hoverOffNode(
          node,
          this.graph,
          this.getActiveSelection(),
      );
    });

    // Add an event listener for right-clicking a node
    this.sigmaInstance.on("rightClickNode", ({node}) => {
      const nodeAttributes = this.graph.getNodeAttributes(node);
      const forceLabel = nodeAttributes.forceLabel;
      this.graph.setNodeAttribute(node, "forceLabel", !forceLabel);
      this.graph.setNodeAttribute(node, "userForceLabel", !forceLabel);
      this.sigmaInstance.refresh();
    });

    // Prevent the context menu from appearing on right-click to stop interfering with the rightClickNode event
    this.container.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    // Event listener for entering an edge
    this.sigmaInstance.on("enterEdge", ({edge}) => {
      this.graphHelper.hoverOnEdge(edge, this.graph);
    });

    // Event listener for leaving an edge
    this.sigmaInstance.on("leaveEdge", ({edge}) => {
      this.graphHelper.hoverOffEdge(edge, this.graph);
    });
  }

  /**
   * Method to fetch the graph data
   * @param {Object} [params={}] - Parameters for fetching the graph data
   */
  fetchGraphData(params = {}) {
    // Set the default parameters
    params.showSubtypes = localStorage.getItem("showSubtypes") === "true" ? "true" : "false";
    console.log("Show subtypes parameter:", params.showSubtypes);

    // Create a new URLSearchParams object
    const query = new URLSearchParams(params).toString();
    const url = "/api/graph-data/" + (
        query ? "?" + query : ""
    );
    console.log("URL:", url);

    // Fetch the data from the URL
    fetch(url)
        .then((response) => response.json())
        .then((data) => {
          // If the type parameter is set, update the graph
          if (params.type) {
            // console.log("Updating");
            this.updateGraph(
                data.nodes,
                data.edges,
                data.visible,
                params.clicked,
            );
            // Otherwise, initialize the graph
          }
          else {
            // console.log("Initializing");
            // console.log(data);
            this.initializeGraph(data.nodes, data.edges, data.visible);
          }
        })
        .catch((error) => console.error("Error loading graph data:", error));
  }

  /**
   * Method to initialize the graph
   * @param {Array} nodes - Array of nodes to initialize
   * @param {Array} edges - Array of edges to initialize
   * @param {Array} visible - Array of visible nodes
   */
  initializeGraph(nodes, edges, visible) {
    const containerCenterX = this.container.offsetWidth / 2;
    const containerCenterY = this.container.offsetHeight / 2;
    this.graph.clear();
    // console.log(this.visibleNodes);
    this.visibleNodes = new Set(visible); // Initialize the visible nodes set
    // console.log(this.visibleNodes);
    // If the camera position is null, set cameraPosition to current camera position
    if (this.cameraPosition === null) {
      // console.log("Setting camera position");
      // Capture camera state
      let camera = this.sigmaInstance.getCamera();
      this.cameraPosition = {
        x: camera.x,
        y: camera.y,
        ratio: camera.ratio,
        angle: camera.angle,
      };
      // console.log(this.cameraPosition);
    } else {
      // console.log("Camera position already set");
      // console.log(this.cameraPosition);
      // Restore camera state
      this.sigmaInstance.getCamera().setState({
        x: this.cameraPosition.x,
        y: this.cameraPosition.y,
        ratio: this.cameraPosition.ratio,
        angle: this.cameraPosition.angle,
      });
    }

    const categoryRadius = 400; // Adjust this value as needed
    const categoryNodes = nodes.filter((node) => node.node_type === "category");
    const categoryAngleStep = (2 * Math.PI) / categoryNodes.length;

    categoryNodes.forEach((node, index) => {
      if (this.visibleNodes.has(node.id)) {
        const angle = categoryAngleStep * index;
        const x = containerCenterX + categoryRadius * Math.cos(angle);
        const y = containerCenterY + categoryRadius * Math.sin(angle);

        const color = this.graphHelper.calculateNodeColor(node);

        this.graph.addNode(node.id, {
          label: node.label,
          full_label: node.label,
          node_type: node.node_type,
          forceLabel: true,
          x: x,
          y: y,
          fixed: true,
          size: 10,
          borderColor: color,
          borderSize: 0,
          hidden: false,
          color: color,
          userForceLabel: false,
        });
      }
    });

    this.graphHelper.applyLayout(this.graph, this.sigmaInstance);
  }

  /**
   * Method to update the graph with the nodes, edges, visible, and clicked parameters
   * @param {Array} nodes - Array of nodes to update
   * @param {Array} edges - Array of edges to update
   * @param {Array} visible - Array of visible nodes
   * @param {boolean} clicked - Flag indicating if the update was triggered by a click
   */
  updateGraph(nodes, edges, visible, clicked) {
    if (!clicked) {
      this.graph.nodes().forEach((node) => {
        this.graph.setNodeAttribute(node, "hidden", true);
      });
      this.graph.edges().forEach((edge) => {
        this.graph.setEdgeAttribute(edge, "hidden", true);
      });
      this.sigmaInstance.refresh();
    }

    visible.forEach((node) => this.visibleNodes.add(node)); // Add new visible nodes to the visibleNodes set

    // Update the nodes and edges in the graph
    nodes.forEach((node) => {
      if (!this.graph.hasNode(node.id) && this.visibleNodes.has(node.id)) {
        let {color, baseSize, borderSize, borderColor} =
            this.graphHelper.calculateBorder(node);

        this.graph.addNode(node.id, {
          label: node.label.replace("HLA_", ""),
          full_label: node.label,
          node_type: node.node_type,
          x: Math.random() * 100,
          y: Math.random() * 100,
          fixed: node.node_type === "category",
          size: baseSize,
          odds_ratio: node.node_type === "allele" ? node.odds_ratio : null,
          allele_count: node.node_type === "disease" ? node.allele_count : null,
          borderColor: node.node_type === "allele" ? borderColor : color,
          borderSize: borderSize,
          color: color,
          expanded: false,
          category: node.node_type === "disease" ? node.category : null,
          forceLabel: node.node_type === "allele",
          userForceLabel: false,
          disease: node.node_type === "allele" ? node.disease : null,
        });
      }

      // Update the node attributes
      this.graph.setNodeAttribute(
          node.id,
          "hidden",
          !this.visibleNodes.has(node.id),
      );
    });

    // Update the edges in the graph
    edges.forEach((edge) => {
      if (
          this.visibleNodes.has(edge.source) &&
          this.visibleNodes.has(edge.target)
      ) {
        if (!this.graph.hasEdge(edge.id)) {
          this.graph.addEdge(edge.source, edge.target, {color: "darkgrey"});
        }
      }
    });

    // Apply the layout to the graph
    this.applyLayout();
  }

  /**
   * Method to apply the layout to the graph
   */
  applyLayout() {
    this.graphHelper.applyLayout(this.graph);
  }

  // Method to get the information table for an allele node
  /**
   * Get the information table for an allele node.
   * @param {Object} nodeData - The data of the node.
   */
  getInfoTable(nodeData) {
    const infoContainer = document.getElementsByClassName("info-container")[0];
    const selectedNode = `${nodeData.node_type}-${nodeData.full_label}`;

    // Get the edges connected to the selected node
    const edges = this.graph.edges().filter((edge) => {
      const source = this.graph.source(edge);
      const target = this.graph.target(edge);
      return source === selectedNode || target === selectedNode;
    });

    // Get the disease nodes connected to the selected node
    const diseaseNodes = edges.map((edge) => {
      return this.graph.source(edge) === selectedNode
          ? this.graph.target(edge)
          : this.graph.source(edge);
    });

    // If there are no disease nodes, log an error and return
    if (diseaseNodes.length === 0) {
      console.error("No disease nodes found.");
      return;
    }

    let currentIndex = 0;

    infoContainer.innerHTML = "";

    // Create a close button for the info container
    const closeButton = document.createElement("button");
    closeButton.className = "btn-close";
    closeButton.onclick = closeInfoContainer(
        // Call the closeInfoContainer function
        this.adjustSigmaContainerHeight,
        this.graph,
        this.sigmaInstance,
    );
    infoContainer.appendChild(closeButton);

    // Create a title for the info container
    const title = document.createElement("h3");
    title.textContent = nodeData.full_label + " Information";
    title.style.textAlign = "center";
    infoContainer.appendChild(title);

    // Create a container for the controls
    const controlContainer = document.createElement("div");
    controlContainer.style.display = "flex";
    controlContainer.style.justifyContent = "center";
    const filterButton = document.createElement("button");
    filterButton.className = "btn btn-primary";
    filterButton.textContent = "Show All Diseases with Allele";
    filterButton.style.justifyContent = "center";
    filterButton.style.justifySelf = "center";
    filterButton.onclick = () => {
      if (window.filterManager) {
        window.filterManager.tableSelectFilter({
                                                 // Call the tableSelectFilter function with the snp field
                                                 field: "snp",
                                                 value: nodeData.full_label,
                                               });
      }
      else {
        console.error("filterManager is not defined");
      }
    };
    // Append the filter button to the control container
    controlContainer.appendChild(filterButton);
    infoContainer.appendChild(controlContainer);

    // Create a container for the navigation buttons
    const navContainer = document.createElement("div");
    navContainer.style.display = "flex";
    navContainer.style.justifyContent = "space-between";
    navContainer.style.marginBottom = "10px";
    navContainer.style.alignItems = "center";

    // If there are multiple disease nodes, create navigation buttons
    if (diseaseNodes.length > 1) {
      const prevButton = document.createElement("button");
      prevButton.className = "btn btn-secondary";
      prevButton.textContent = "<";
      prevButton.onclick = () => {
        currentIndex =
            (
                currentIndex - 1 + diseaseNodes.length
            ) % diseaseNodes.length;
        displayNodeInfo(diseaseNodes[currentIndex]);
      };
      navContainer.appendChild(prevButton);

      const navText = document.createElement("p");
      navText.style.textAlign = "center";
      navText.style.alignSelf = "center";
      navText.style.fontStyle = "italic";
      navText.style.fontWeight = "bold";
      navText.textContent = "<- Navigate between diseases ->";
      navText.style.margin = "0";

      navContainer.append(navText);

      const nextButton = document.createElement("button");
      nextButton.className = "btn btn-secondary";
      nextButton.textContent = ">";
      nextButton.onclick = () => {
        currentIndex = (
            currentIndex + 1
        ) % diseaseNodes.length;
        displayNodeInfo(diseaseNodes[currentIndex]);
      };
      navContainer.appendChild(nextButton);
    }

    infoContainer.appendChild(navContainer);

    // Function to display the odds tables for the allele node
    /**
     * Display the odds tables for the allele node.
     * @param {Object} data - The data containing the odds information.
     */
    const displayOddsTables = (data) => {
      const {top_odds, lowest_odds} = data;

      // Function to create the odds table
      /**
       * Create the odds table.
       * @param {Array} oddsData - The data for the odds table.
       * @param {string} heading - The heading for the odds table.
       */
      const createOddsTable = (oddsData, heading) => {
        const oddsHead = document.createElement("h4");
        oddsHead.textContent = heading;
        oddsHead.style.textAlign = "center";
        infoContainer.appendChild(oddsHead);

        // Create a table element
        const table = document.createElement("table");
        table.className =
            "odds-table table table-striped table-bordered table-hover table-sm";

        // Create header row
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

        // Iterate over the odds data and create rows for the table
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
            GraphHelper.simulateClickToNode(
                // Add the simulateClickToNode function to click to the disease node
                this,
                this.graph,
                odds.phewas_string,
                this.graphHelper,
            );
          };
          table.appendChild(row);
        });

        // Append the table to the info container
        infoContainer.appendChild(table);
      };

      // Create the odds tables for the top and lowest odds
      createOddsTable(top_odds, "Most Affected Diseases");
      createOddsTable(lowest_odds, "Most Mitigated Diseases");
    };

    // Function to update node styles
    /**
     * Update the node styles.
     * @param {Object} nodeData - The data of the node.
     * @param {string} diseaseNode - The disease node ID.
     */
    const updateNodeStyles = (nodeData, diseaseNode) => {
      // Get the allele node
      const alleleNode = `allele-HLA_${nodeData.gene_name}_${nodeData.serotype.toString()}${
          localStorage.getItem("showSubtypes") === "true" ? "" + nodeData.subtype.toString() : ""
      }`;

      // Update allele node
      const node = this.graph.getNodeAttributes(alleleNode);
      node.node_type = "allele";
      node.odds_ratio = nodeData.odds_ratio;
      node.p = nodeData.p;

      let {color, baseSize, borderSize, borderColor} =
          this.graphHelper.calculateBorder(node);

      this.graph.setNodeAttribute(alleleNode, "color", color);
      this.graph.setNodeAttribute(alleleNode, "borderColor", borderColor);
      this.graph.setNodeAttribute(alleleNode, "borderSize", borderSize);
      this.graph.setNodeAttribute(alleleNode, "size", baseSize);

      // Reset other nodes
      this.graph.nodes().forEach((node) => {
        if (
            node !== diseaseNode &&
            this.graph.getNodeAttribute(node, "node_type") === "disease"
        ) {
          this.graph.setNodeAttribute(
              node,
              "borderColor",
              this.graph.getNodeAttribute(node, "color"),
          );
          this.graph.setNodeAttribute(node, "borderSize", 0);
          if (this.graph.getNodeAttribute(node, "userForceLabel") === false) {
            this.graph.setNodeAttribute(node, "forceLabel", false);
          }
        }

        if (
            this.graph.getNodeAttribute(node, "node_type") === "allele" &&
            node !== alleleNode
        ) {
          if (this.graph.getNodeAttribute(node, "userForceLabel") === false) {
            this.graph.setNodeAttribute(node, "forceLabel", false);
          }
          else {
            this.graph.setNodeAttribute(node, "forceLabel", true);
          }
        }
      });

      // Update disease node
      this.graph.setNodeAttribute(diseaseNode, "borderColor", "black");
      this.graph.setNodeAttribute(diseaseNode, "borderSize", 0.1);
      this.graph.setNodeAttribute(diseaseNode, "forceLabel", true);

      // Find and update the edge connecting the disease and allele node
      const edge = this.graph.edges().find((edge) => {
        return (
            this.graph.source(edge) === diseaseNode &&
            this.graph.target(edge) === alleleNode
        );
      });

      // Update the selected nodes
      this.selectedAlleleNode = alleleNode;
      this.selectedDiseaseNode = diseaseNode;

      if (edge) {
        this.graph.setEdgeAttribute(edge, "color", "black");
      }
      else {
        console.error("Edge from disease to allele not found");
      }

      // Set all other edges to default color and size
      this.graph.edges().forEach((e) => {
        if (e !== edge) {
          this.graph.setEdgeAttribute(e, "color", "darkgrey");
        }
      });

      // Refresh the Sigma instance
      this.sigmaInstance.refresh();
    };

    // Function to display the node information
    /**
     * Display the node information.
     * @param {string} diseaseNode - The disease node ID.
     */
    const displayNodeInfo = (diseaseNode) => {
      // Get the existing disease info container
      const existingDiseaseInfo = infoContainer.querySelector(".disease-info");

      // Get the disease name
      const disease = this.graph.getNodeAttributes(diseaseNode).full_label;
      if (!disease) {
        console.error("Disease is null or undefined");
        return;
      }
      // Encode the allele and disease names
      const encodedAllele = encodeURIComponent(nodeData.full_label);
      const encodedDisease = encodeURIComponent(disease);
      // Fetch the data from the URL
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

            // Create a table element for the disease info
            const table = document.createElement("table");
            // Set the class name for the table
            table.className =
                "disease-info allele-info-table table table-striped table-bordered table-hover table-sm";
            // Create a header row for the table
            const headerRow = document.createElement("tr");
            const header1 = document.createElement("th");
            header1.textContent = "Field";
            headerRow.appendChild(header1);
            const header2 = document.createElement("th");
            header2.textContent = "Value";
            headerRow.appendChild(header2);
            table.appendChild(headerRow);

            // Iterate over the data and create rows for the table
            Object.entries(data).forEach(([key, value]) => {
              if (key !== "top_odds" && key !== "lowest_odds") {
                const row = document.createElement("tr");
                const cell1 = document.createElement("td");
                cell1.textContent = key;
                row.appendChild(cell1);
                const cell2 = document.createElement("td");
                cell2.textContent = value;
                row.appendChild(cell2);
                // If the key is phewas_string, create a button to show combinational associations
                if (key === "phewas_string") {
                  const cell3 = document.createElement("td");
                  const button = document.createElement("button");
                  button.className = "btn btn-primary";
                  button.textContent = "Show Combinational Associations";
                  // Get the showSubtypes value from local storage
                  const showSubtypes = localStorage.getItem("showSubtypes") === "true";
                  button.onclick = () => {
                    fetchAndShowAssociations(value, showSubtypes);
                  };
                  cell3.appendChild(button);
                  row.appendChild(cell3);
                }
                table.appendChild(row);
              }
            });

            // Set the overflow style for the info container
            infoContainer.style.overflowY = "auto";
            if (existingDiseaseInfo) {
              // Replace the existing disease info with the table
              existingDiseaseInfo.replaceWith(table);
            }
            else {
              // Append the table to the info container
              infoContainer.appendChild(table);
            }
            // Update the node styles based on the new table data
            updateNodeStyles(data, diseaseNode);
          })
          .catch((error) => {
            // Log an error if the data cannot be fetched
            console.error("Error loading disease info:", error);
            const errorMessage = document.createElement("div");
            errorMessage.className = "disease-info alert alert-danger";
            errorMessage.textContent = `Error loading disease info: ${error.message}`;
            infoContainer.appendChild(errorMessage);
          });
    };

    // Display the node information for the first disease node
    displayNodeInfo(diseaseNodes[currentIndex]);

    // Get the allele node
    const encodedAllele = encodeURIComponent(nodeData.full_label);
    // Get the disease node
    const encodedDisease = encodeURIComponent(
        // Get the full label of the disease node
        this.graph.getNodeAttributes(diseaseNodes[currentIndex]).full_label,
    );
    // Fetch the data from the URL
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

          // Display the odds tables for the allele node
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

// Getters for the active selection
  /**
   * Get the active selection.
   * @returns {Object} The active selection containing allele and disease nodes.
   */
  getActiveSelection() {
    return {
      allele: this.selectedAlleleNode,
      disease: this.selectedDiseaseNode,
    };
  }
}
export default GraphManager;
