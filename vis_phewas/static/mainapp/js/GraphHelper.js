import forceAtlas2 from "graphology-layout-forceatlas2";
import { rgbaToFloat } from "sigma/utils";
import { clamp, closeInfoContainer, diseaseColor, sizeScale } from "./utils";
import { filterManager } from "./main";

// Helper class for graph operations
class GraphHelper {
  // Constructor
  constructor(GraphManager, sigmaInstance, adjustSigmaContainerHeight) {
    this.sigmaInstance = sigmaInstance;
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    this.graphManager = GraphManager;
  }

  // Method for clicking on a node
  clickedNode(
    graph,
    node,
    fetchGraphData,
    adjustSigmaContainerHeight,
    getInfoTable,
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
        // If the node is not expanded
      } else {
        // Fetch graph data for diseases
        fetchGraphData({
          type: "diseases",
          category_id: node,
          filters: filterManager.filters,
          clicked: true,
        });
        // Get the diseases for the category
        this.getDiseasesForCategory(node);
        // Set expanded to true
        nodeData.expanded = true;
      }
      // If the node is a disease
    } else if (nodeData.node_type === "disease") {
      // If the node is expanded
      if (nodeData.expanded) {
        removeChildrenNodes(node);
        nodeData.expanded = false;
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
        nodeData.userForceLabel = true;
      }
      // If the node is an allele
    } else if (nodeData.node_type === "allele") {
      this.displayInfoContainer(adjustSigmaContainerHeight);
      graph.nodes().forEach((n) => {
        if (
          graph.getNodeAttribute(n, "node_type") === "allele" &&
          !n.userForceLabel
        ) {
          graph.setNodeAttribute(n, "forceLabel", false);
        }
      });
      nodeData.forceLabel = true;
      // Get the info table for the allele
      getInfoTable(nodeData);
    }
  }

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

  // Method for simulating a click to a node in the graph
  static simulateClickToNode(
    graphManagerInstance,
    graph,
    diseaseName,
    graphHelperInstance,
  ) {
    console.log(graph);
    diseaseName = encodeURIComponent(diseaseName);
    const url = `/api/get-path-to-node/?disease=${diseaseName}`;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        const path = data.path;
        console.log("Path to node:", path);

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

  getDiseasesForCategory(category) {
    this.displayInfoContainer(this.adjustSigmaContainerHeight);
    const infoContainer = document.getElementsByClassName("info-container")[0];
    infoContainer.innerHTML = "";
    // Add close button to the info panel
    const closeButton = document.createElement("button");
    closeButton.className = "btn-close";
    closeButton.setAttribute("type", "button");
    closeButton.onclick = closeInfoContainer(this.adjustSigmaContainerHeight, this.graphManager.graph);

    infoContainer.appendChild(closeButton);


    category = category.replace("cat-", "");
    category = encodeURIComponent(category);
    const url = `/api/get-diseases/?category=${category}`;
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        const table = document.createElement("table");
        table.className = "table table-striped table-bordered table-hover table-sm";
        console.log(data.diseases);
        const diseases = data.diseases;

        const thead = document.createElement("thead");
        thead.innerHTML = `<tr><th>Disease</th></tr>`;
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        diseases.forEach((disease) => {
          const tr = document.createElement("tr");
          const td = document.createElement("td");
          td.textContent = disease
          tr.appendChild(td);
          tbody.appendChild(tr);
          table.appendChild(tbody);

          tr.addEventListener("click", (event) => {
            const diseaseName = event.target.textContent;
            console.log(this.graphManager);
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

  // Method for hovering on a node
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

  // Method for hovering off a node
  hoverOffNode(node, graph) {
    if (
      !this.sigmaInstance ||
      typeof this.sigmaInstance.refresh !== "function"
    ) {
      console.error(
        "Sigma instance or refresh method not available in hoverOffNode",
      );
      return;
    }

    // Get the edges of the node
    const nodeId = node;
    const edges = graph.edges().filter((edge) => {
      return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    // Reset the color of the edges
    edges.forEach((edge) => {
      graph.setEdgeAttribute(edge, "color", "darkgrey");
    });

    // Refresh the sigma instance
    this.sigmaInstance.refresh();
  }

  // Method for updating the graph
  applyLayout(graph) {
    // Get the nodes of the graph
    const nodes = graph.nodes();
    // Sort the nodes by label
    const sortedNodes = nodes.sort((a, b) => {
      return graph
        .getNodeAttribute(a, "label")
        .localeCompare(graph.getNodeAttribute(b, "label"));
    });

    // Set the x and y coordinates of the nodes
    let angleStep = -(2 * Math.PI) / sortedNodes.length;
    sortedNodes.forEach((node, index) => {
      if (graph.getNodeAttribute(node, "node_type") !== "category") {
        graph.setNodeAttribute(
          node,
          "x",
          100 * Math.cos(Math.PI / 2 + angleStep * index),
        );
        graph.setNodeAttribute(
          node,
          "y",
          100 * Math.sin(Math.PI / 2 + angleStep * index),
        );
      }
    });

    // Apply the force atlas 2 layout
    const settings = {
      iterations: 1000,
      settings: {
        gravity: 0.1,
        scalingRatio: 10,
        // barnesHutOptimize: true,
        // barnesHutTheta: 0.5,
        adjustSizes: true,
      },
    };
    forceAtlas2.assign(graph, settings);
    this.sigmaInstance.refresh();
  }

  // Method for calculating the color of a node
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

  // Method for calculating the border of a node
  calculateBorder(node) {
    // Set the color of the node based on the node type
    const color = this.calculateNodeColor(node);
    //  Set the size of the node based on the node type
    const baseSize =
      node.node_type === "allele"
        ? sizeScale(clamp(node.p, sizeScale.domain()))
        : 6;

    // Set the border size and color based on the odds ratio
    let borderScaleFactor = 0.5;
    let oddsRatio = node.odds_ratio;
    let oddsRatioDeviation = Math.abs(oddsRatio - 1);
    let scaledBorderSize;

    // If the odds ratio is greater than or equal to 1
    if (oddsRatio >= 1) {
      // Set the scaled border size
      scaledBorderSize = clamp(oddsRatioDeviation / 8, [0, 1]);
    } else {
      // Set the scaled border size
      scaledBorderSize = clamp(1 / oddsRatio - 1, [0, 1]);
    }
    // Set the border size and color
    let finalBorderSize = baseSize * borderScaleFactor * scaledBorderSize;
    let borderSize = clamp(finalBorderSize, [0.5, baseSize * 0.5]);
    let borderColor = node.odds_ratio >= 1 ? "red" : "blue";
    // Return the border size and color
    return { color, baseSize, borderSize, borderColor };
  }
}

// Export the GraphHelper class
export default GraphHelper;
