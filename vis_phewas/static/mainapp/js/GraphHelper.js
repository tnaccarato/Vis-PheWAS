import { rgbaToFloat } from "sigma/utils";
import {
  clamp,
  closeInfoContainer,
  diseaseColor,
  formatCategoryString,
  sizeScale,
} from "./utils";
import { filterManager } from "./main";
import forceAtlas2 from "graphology-layout-forceatlas2";

// Helper class for graph operations
class GraphHelper {
  /**
   * Constructor for GraphHelper
   * @param {Object} GraphManager - The graph manager instance
   * @param {Object} sigmaInstance - The sigma instance for graph rendering
   * @param {Function} adjustSigmaContainerHeight - Function to adjust the height of the sigma container
   */
  constructor(GraphManager, sigmaInstance, adjustSigmaContainerHeight) {
    this.sigmaInstance = sigmaInstance;
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    this.graphManager = GraphManager;
  }

  /**
   * Method for clicking on a node
   * @param {Object} graph - The graph instance
   * @param {string} node - The node ID
   * @param {Function} fetchGraphData - Function to fetch graph data
   * @param {Function} adjustSigmaContainerHeight - Function to adjust the height of the sigma container
   * @param {Function} [getInfoTable=null] - Optional function to get the info table
   * @param {boolean} [simulated=false] - Flag indicating if the click is simulated
   */
  clickedNode(
    graph,
    node,
    fetchGraphData,
    adjustSigmaContainerHeight,
    getInfoTable = null,
    simulated = false,
  ) {
    // Get the node data
    const nodeData = graph.getNodeAttributes(node);

    // Recursive function to remove children nodes
    const removeChildrenNodes = (nodeId) => {
      // Get children nodes as out neighbors of the node
      const children = graph.outNeighbors(nodeId);
      // Iterate over the children nodes
      children.forEach((child) => {
        // If the child node has more than one in neighbor
        if (graph.inNeighbors(child).length > 1) {
          // Find the edge between the node and the child
          const edge = graph.edges().find((edge) => {
            // Return the edge if the source is the node and the target is the child
            return (
              graph.source(edge) === nodeId && graph.target(edge) === child
            );
          });
          // Drop the edge
          graph.dropEdge(edge);
          return;
        }
        // Remove the children nodes of the child node
        removeChildrenNodes(child);
        graph.dropNode(child);
      });
    };

    // If the node is a category
    if (nodeData.node_type === "category") {
      // If the node is expanded
      if (nodeData.expanded) {
        // Remove children nodes
        removeChildrenNodes(node);
        /// Set expanded to false
        nodeData.expanded = false;
        // Close the info container with diseases
        closeInfoContainer(
          adjustSigmaContainerHeight,
          graph,
          this.sigmaInstance,
        )();
      }

      // If the node is not expanded
      else {
        // Fetch graph data for diseases
        fetchGraphData({
          type: "diseases",
          category_id: node,
          filters: filterManager.filters,
          clicked: true,
        });
        nodeData.expanded = true;
        if (!simulated) {
          this.getDiseasesForCategory(node);
        }
      }
      // If the node is a disease
    } else if (nodeData.node_type === "disease") {
      // If the node is expanded
      if (nodeData.expanded) {
        removeChildrenNodes(node);
        nodeData.expanded = false;
        nodeData.forceLabel = false;
        // If the node is not expanded
      } else {
        // Fetch graph data for alleles
        fetchGraphData({
          type: "alleles",
          disease_id: encodeURIComponent(node),
          filters: filterManager.filters,
          clicked: true,
        });
        nodeData.expanded = true;
        nodeData.forceLabel = true;
        // nodeData.userForceLabel = true;
      }
      // If the node is an allele
    } else if (nodeData.node_type === "allele") {
      this.displayInfoContainer(adjustSigmaContainerHeight);
      graph.nodes().forEach((n) => {
        const node_type = graph.getNodeAttribute(n, "node_type");
        if (node_type !== "category" && !n.userForceLabel) {
          graph.setNodeAttribute(n, "forceLabel", false);
        }
      });
      nodeData.forceLabel = true;
      // Get the info table for the allele
      if (getInfoTable) {
        getInfoTable(nodeData);
      }
    }
  }

  /**
   * Method to display the info container
   * @param {Function} adjustSigmaContainerHeight - Function to adjust the height of the sigma container
   */
  displayInfoContainer(adjustSigmaContainerHeight) {
    // Display the allele info in the info panel
    const leftColumn = document.getElementsByClassName(
      "col-md-6 left-column",
    )[0];
    leftColumn.style.width = "70%";
    adjustSigmaContainerHeight();
    const rightColumn = document.getElementsByClassName(
      "col-md-6 right-column",
    )[0];
    rightColumn.style.width = "30%";
    rightColumn.style.display = "inline-block";
    const infoPanel = document.getElementsByClassName("info-container")[0];
    infoPanel.style.display = "inline-block";
  }

  /**
   * Static method to simulate a click to a node in the graph
   * @param {Object} graphManagerInstance - The graph manager instance
   * @param {Object} graph - The graph instance
   * @param {string} diseaseName - The disease name
   * @param {Object} graphHelperInstance - The graph helper instance
   */
  static simulateClickToNode(
    graphManagerInstance,
    graph,
    diseaseName,
    graphHelperInstance,
  ) {
    diseaseName = encodeURIComponent(diseaseName);
    const url = `/api/get-path-to-node/?disease=${diseaseName}`;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        const path = data.path;

        const clickNodesInPath = (index) => {
          if (index >= path.length) return;

          const nodeId = path[index];
          // Check if node is expanded
          const nodeData = graph.getNodeAttributes(nodeId);
          if (nodeData.expanded) {
            clickNodesInPath(index + 1);
            return;
          }
          graphHelperInstance.clickedNode(
            graph,
            nodeId,
            graphManagerInstance.fetchGraphData.bind(graphManagerInstance),
            graphManagerInstance.adjustSigmaContainerHeight.bind(
              graphManagerInstance,
            ),
            graphManagerInstance.getInfoTable.bind(graphManagerInstance),
            true, // Simulated click
          );

          setTimeout(() => {
            clickNodesInPath(index + 1);
          }, 500);
        };

        clickNodesInPath(0);
      })
      .catch((error) => {
        console.error("Error fetching path to node:", error);
      });
  }

  /**
   * Method to get diseases for a category
   * @param {string} category - The category ID
   */
  getDiseasesForCategory(category) {
    // Display the info container
    this.displayInfoContainer(this.adjustSigmaContainerHeight);
    // Get the info container
    const infoContainer = document.getElementsByClassName("info-container")[0];
    infoContainer.innerHTML = "";
    // Add close button to the info panel
    const closeButton = document.createElement("button");
    closeButton.className = "btn-close";
    closeButton.setAttribute("type", "button");
    closeButton.onclick = closeInfoContainer(
      this.adjustSigmaContainerHeight,
      this.graphManager.graph,
    );

    // Add the close button to the info container
    infoContainer.appendChild(closeButton);

    // Get the diseases for the category
    category = category.replace("category-", ""); // Remove the category prefix for easier processing
    // Encode components and construct the URL
    let encoded_category = encodeURIComponent(category);
    let filters = encodeURIComponent(filterManager.filters);
    // Construct the URL and fetch the data
    const url = `/api/get-diseases/?category=${encoded_category}&filters=${filters}`;
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        // Create a header for the diseases
        const diseases = data.diseases;
        const diseaseCount = diseases.length;
        const header = document.createElement("h3");
        header.innerHTML = `<i>${diseaseCount}</i> Diseases for ${formatCategoryString(category)}`;
        header.style.alignSelf = "center";
        infoContainer.appendChild(header);
        // Create a table for the diseases for the category
        const table = document.createElement("table");
        table.className =
          "table table-striped table-bordered table-hover table-sm";

        const thead = document.createElement("thead");
        thead.innerHTML = `<tr><th>Disease</th></tr>`;
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        diseases.forEach((disease) => {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.textContent = disease;
          tr.appendChild(td);
          tbody.appendChild(tr);
          table.appendChild(tbody);

          // Add an event listener to the table row to simulate a click to the node
          tr.addEventListener("click", (event) => {
            const diseaseName = event.target.textContent;
            GraphHelper.simulateClickToNode(
              this.graphManager,
              this.graphManager.graph,
              diseaseName,
              this,
            );
          });
        });

        infoContainer.appendChild(table);
      })
      .catch((error) =>
        console.error("Error loading diseases for category:", error),
      );
  }

  /**
   * Method for hovering on a node
   * @param {string} node - The node ID
   * @param {Object} graph - The graph instance
   */
  hoverOnNode(node, graph) {
    const nodeId = node;
    // Get the edges of the node
    const edges = graph.edges().filter((edge) => {
      return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });
    // Iterate over the edges
    edges.forEach((edge) => {
      // Set the color of the edge to black
      graph.setEdgeAttribute(edge, "color", "black");
    });

    // Display the edge source on hover
    edges.forEach((edge) => {
      this.hoverOnEdge(edge, this.graphManager.graph);
    });

    // Refresh the sigma instance
    if (
      this.sigmaInstance &&
      typeof this.sigmaInstance.refresh === "function"
    ) {
      this.sigmaInstance.refresh();
      // If the sigma instance is not available display an error message
    } else {
      console.error(
        "Sigma instance or refresh method not available in hoverOnNode",
      );
    }
  }

  /**
   * Method for hovering off a node
   * @param {string} node - The node ID
   * @param {Object} graph - The graph instance
   * @param {Object} [activeSelection=null] - The active selection object
   */
  hoverOffNode(node, graph, activeSelection = null) {
    if (
      !this.sigmaInstance ||
      typeof this.sigmaInstance.refresh !== "function"
    ) {
      console.error(
        "Sigma instance or refresh method not available in hoverOffNode",
      );
      return;
    }

    // Get the selected nodes
    const selectedDiseaseNode = activeSelection.disease;
    const selectedAlleleNode = activeSelection.allele;

    // Get the edges of the node
    const nodeId = node;
    const edges = graph.edges().filter((edge) => {
      return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    // Reset the color of the edges, but not for the selected edge
    edges.forEach((edge) => {
      const source = graph.source(edge);
      const target = graph.target(edge);
      const isSelectedEdge =
        (source === selectedDiseaseNode && target === selectedAlleleNode) ||
        (source === selectedAlleleNode && target === selectedDiseaseNode);

      if (!isSelectedEdge) {
        graph.setEdgeAttribute(edge, "color", "darkgrey");
      }
    });

    // Hide the edge source on hover
    edges.forEach((edge) => {
      this.hoverOffEdge(edge, this.graphManager.graph);
    });

    // Refresh the sigma instance
    this.sigmaInstance.refresh();
  }

  /**
   * Method for updating the graph with layout and handling interactions
   * @param {Object} graph - The graph instance
   */
  applyLayout(graph) {
    const nodes = graph.nodes();
    const categoryNodes = nodes.filter(
      (node) => graph.getNodeAttribute(node, "node_type") === "category",
    );
    const centerX = 500;
    const centerY = 500;
    const categoryRadius = Math.max(400, categoryNodes.length * 20);

    // Position category nodes in a circle
    const categoryAngleStep = (2 * Math.PI) / categoryNodes.length;
    categoryNodes.forEach((categoryNode, index) => {
      const angle = categoryAngleStep * index;
      const x = centerX + categoryRadius * Math.sin(angle);
      const y = centerY + categoryRadius * Math.cos(angle);
      graph.setNodeAttribute(categoryNode, "x", x);
      graph.setNodeAttribute(categoryNode, "y", y);
      graph.setNodeAttribute(categoryNode, "fixed", true);
    });

    // Calculate the distance between adjacent categories
    const angleDiff = categoryAngleStep;
    const distanceBetweenCategories =
      2 * categoryRadius * Math.sin(angleDiff / 2);
    const diseaseNodeRadius = 0.4 * distanceBetweenCategories;

    categoryNodes.forEach((categoryNode) => {
      const relatedDiseaseNodes = nodes.filter(
        (node) =>
          graph.getNodeAttribute(node, "category") ===
            graph.getNodeAttribute(categoryNode, "label") &&
          graph.getNodeAttribute(node, "node_type") === "disease",
      );

      const diseaseAngleStep = (2 * Math.PI) / relatedDiseaseNodes.length;

      relatedDiseaseNodes.forEach((diseaseNode, index) => {
        const angle = diseaseAngleStep * index;
        const diseaseX =
          graph.getNodeAttribute(categoryNode, "x") +
          diseaseNodeRadius * Math.sin(angle);
        const diseaseY =
          graph.getNodeAttribute(categoryNode, "y") +
          diseaseNodeRadius * Math.cos(angle);

        graph.setNodeAttribute(diseaseNode, "x", diseaseX);
        graph.setNodeAttribute(diseaseNode, "y", diseaseY);
        graph.setNodeAttribute(diseaseNode, "fixed", true);

        // Position allele nodes around their disease node, only outward-facing
        const alleleNodes = graph
          .outNeighbors(diseaseNode)
          .filter((n) => graph.getNodeAttribute(n, "node_type") === "allele");

        const alleleRadius = Math.max(20, diseaseNodeRadius * 0.4);
        const baseAngle = Math.atan2(
          diseaseY - graph.getNodeAttribute(categoryNode, "y"),
          diseaseX - graph.getNodeAttribute(categoryNode, "x"),
        );
        const startAngle = baseAngle - Math.PI / 6; // 30 degrees left of the outward direction
        const endAngle = baseAngle + Math.PI / 6; // 30 degrees right of the outward direction
        const alleleAngleStep = (endAngle - startAngle) / alleleNodes.length;

        // Calculate the stagger offset (alternates up and down)
        const staggerOffset = (index % 2 === 0 ? 1 : -1) * (alleleRadius / 2);

        alleleNodes.forEach((alleleNode, index) => {
          const alleleAngle = startAngle + alleleAngleStep * index;
          const staggeredY =
            staggerOffset + diseaseY + alleleRadius * Math.sin(alleleAngle);
          const alleleX = diseaseX + alleleRadius * Math.cos(alleleAngle);
          const alleleY = staggeredY;

          // Check if the allele node is connected to multiple diseases
          const connectedDiseases = graph
            .inNeighbors(alleleNode)
            .filter(
              (n) => graph.getNodeAttribute(n, "node_type") === "disease",
            );

          if (connectedDiseases.length > 1) {
            // If connected to multiple diseases, make it flexible (unfixed)
            graph.setNodeAttribute(alleleNode, "fixed", false);
          } else {
            // Otherwise, fix it in place with a specific position
            graph.setNodeAttribute(alleleNode, "x", alleleX);
            graph.setNodeAttribute(alleleNode, "y", alleleY);
            graph.setNodeAttribute(alleleNode, "fixed", true);
          }
        });
      });
    });

    // Apply force layout to flexible nodes
    const settings = {
      iterations: 100,
      settings: {
        gravity: 0.005,
        scalingRatio: 3,
        strongGravityMode: true,
        edgeWeightInfluence: 1,
        slowDown: 10,
      },
      nodeUpdater: (node, attributes) => !attributes.fixed,
    };
    forceAtlas2.assign(graph, settings);

    this.sigmaInstance.refresh();
  }

  /**
   * Method for calculating the color of a node
   * @param {Object} node - The node object
   * @returns {number} - The color of the node
   */
  calculateNodeColor(node) {
    if (node.hidden) {
      return rgbaToFloat(0, 0, 0, 0);
    }

    // Set the color of the node based on the node type
    switch (node.node_type) {
      // If the node is a category
      case "category":
        return "#0fc405";
      // If the node is a disease set the color based on the allele count
      case "disease":
        return diseaseColor(clamp(node.allele_count, diseaseColor.domain()));
      // If the node is an allele
      case "allele":
        return "#e871fb";
      default:
        return "#000000";
    }
  }

  /**
 * Method for calculating the border and size of a node.
 * @param {Object} node - The node object.
 * @returns {Object} - The border properties of the node.
 */
calculateBorder(node) {
  console.log("Node:", node);
  let baseSize;
  let borderSize;
  let borderColor;
  let color;

  // Get the color of the node
  color = this.calculateNodeColor(node);
  // Handle category nodes
  if (node.node_type === "category") {
    baseSize = 10; // Constant size
    borderSize = 0; // No border
    borderColor = color;
  } else if (node.node_type === "disease") {
    baseSize = 10; // Constant size for diseases
    color = diseaseColor(node.allele_count); // Color based on the number of alleles
    borderSize = 0; // No border needed for diseases
    borderColor = color;
  } else if (node.node_type === "allele") {
    console.log("OR:", node.odds_ratio);
    console.log("P-Value:", node.p);
    const pValue = node.p || 0.05; // Use p-value for sizing alleles
    baseSize = sizeScale(clamp(pValue, sizeScale.domain())); // Scale size based on clamped p-value

    // Determine border color based on odds ratio
    const oddsRatio = node.odds_ratio || 1; // Default to 1 if odds ratio is not defined
    borderColor = oddsRatio >= 1 ? "red" : "blue";

    // Calculate border thickness based on deviation from OR = 1
    const oddsRatioDeviation = Math.abs(oddsRatio - 1);
    const borderScaleFactor = 0.5; // Factor to adjust border size relative to base size
    borderSize = baseSize * borderScaleFactor * oddsRatioDeviation; // Thickness proportional to deviation

    // Clamp border size to avoid excessive or minimal borders
    borderSize = clamp(borderSize, [0.25, baseSize * 0.75]);
  }

  console.log("Border Size:", borderSize);
  console.log("Border Color:", borderColor);
  console.log("Color:", color);
  console.log("Base Size:", baseSize);

  // Return the border size and color
  return { color, baseSize, borderSize, borderColor };
}

  /**
   * Show the source of edge on a label on hover
   * @param {string} edge - The edge ID
   * @param {Object} graph - The graph instance
   */
  hoverOnEdge(edge, graph) {
    // Get the source of the edge and the label of the source
    const source = graph.source(edge);
    const sourceLabel = graph.getNodeAttribute(source, "label");
    if (graph.getNodeAttribute(source, "node_type") === "disease") {
      const edgeLabel = `${sourceLabel}`;
      graph.setEdgeAttribute(edge, "label", edgeLabel);
      graph.setEdgeAttribute(edge, "forceLabel", true);
    }
  }

  /**
   * Hide the source of edge on a label on hover
   * @param {string} edge - The edge ID
   * @param {Object} graph - The graph instance
   */
  hoverOffEdge(edge, graph) {
    graph.setEdgeAttribute(edge, "label", "");
  }
}

// Export the GraphHelper class
export default GraphHelper;
