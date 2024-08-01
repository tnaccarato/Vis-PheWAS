import {filterManager} from "./main";
import forceAtlas2     from "graphology-layout-forceatlas2";
import { rgbaToFloat } from "sigma/utils";
import { clamp, diseaseColor, sizeScale } from "./utils";

export function clickedNode(
  graph,
  node,
  fetchGraphData,
  adjustSigmaContainerHeight,
  getInfoTable,
) {
  const nodeData = graph.getNodeAttributes(node);

  // Recursive helper function to remove children nodes
  const removeChildrenNodes = (nodeId) => {
    const children = graph.outNeighbors(nodeId);
    children.forEach((child) => {
      // If the child node has siblings, do not remove it, only remove the edge connecting it to the parent
      if (graph.inNeighbors(child).length > 1) {
        const edge = graph.edges().find((edge) => {
          return graph.source(edge) === nodeId && graph.target(edge) === child;
        });
        graph.dropEdge(edge); // Remove the edge connecting the child to the parent
        return;
      }
      removeChildrenNodes(child); // Recursively remove children of the child node
      graph.dropNode(child); // Remove the child node itself
    });
  };

  if (nodeData.node_type === "category") {
    if (nodeData.expanded) {
      // Collapse node by recursively removing children
      removeChildrenNodes(node);
      nodeData.expanded = false;
    } else {
      // Expand node by fetching and displaying children
      fetchGraphData({
        type: "diseases",
        category_id: node,
        filters: filterManager.filters,
        clicked: true,
      });
      nodeData.expanded = true;
    }
  } else if (nodeData.node_type === "disease") {
    if (nodeData.expanded) {
      // Collapse node by recursively removing children
      removeChildrenNodes(node);
      nodeData.expanded = false;
    } else {
      // Expand node by fetching and displaying children
      fetchGraphData({
        type: "alleles",
        disease_id: encodeURIComponent(node),
        filters: filterManager.filters,
        clicked: true,
      });
      nodeData.expanded = true;
      // Force display the label of the clicked node
      nodeData.forceLabel = true;
    }
  } else if (nodeData.node_type === "allele") {
    const leftColumn = document.getElementsByClassName(
      "col-md-6 left-column",
    )[0];
    leftColumn.style.width = "70%";
    // Resize the Sigma container
    adjustSigmaContainerHeight();
    const rightColumn = document.getElementsByClassName(
      "col-md-6 right-column",
    )[0];
    rightColumn.style.width = "30%";
    rightColumn.style.display = "inline-block";
    const infoPanel = document.getElementsByClassName("info-container")[0];
    infoPanel.style.display = "inline-block";
    // Reset forceLabel for all other  allele nodes
    graph.nodes().forEach((n) => {
      if (
        graph.getNodeAttribute(n, "node_type") === "allele" &&
        n.userForceLabel === false
      ) {
        graph.setNodeAttribute(n, "forceLabel", false);
      }
    });
    // Force display the label of the clicked node
    nodeData.forceLabel = true;

    getInfoTable(nodeData);
  }

  // Update the node with new attributes
  // graph.setNodeAttributes(node, nodeData);
}

export function hoverOnNode(node, graph, sigmaInstance) {
  const nodeId = node;
  const edges = graph.edges().filter((edge) => {
    return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
  });

  edges.forEach((edge) => {
    graph.setEdgeAttribute(edge, "color", "black");
  });

  if (sigmaInstance && typeof sigmaInstance.refresh === "function") {
    sigmaInstance.refresh();
  } else {
    console.error(
      "Sigma instance or refresh method not available in hoverOnNode",
    );
  }
}

export function hoverOffNode(node, graph, sigmaInstance) {
  if (!sigmaInstance || typeof sigmaInstance.refresh !== "function") {
    console.error(
      "Sigma instance or refresh method not available in hoverOffNode",
    );
    return;
  }

  // Get the edges connected to the node
  const nodeId = node;
  const edges = graph.edges().filter((edge) => {
    return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
  });

  edges.forEach((edge) => {
    graph.setEdgeAttribute(edge, "color", "darkgrey");
  });

  sigmaInstance.refresh();
}

export function getApplyLayout(graph, sigmaInstance) {
  // Retrieve nodes and sort them alphabetically by label
  const nodes = graph.nodes();
  const sortedNodes = nodes.sort((a, b) => {
    return graph
      .getNodeAttribute(a, "label")
      .localeCompare(graph.getNodeAttribute(b, "label"));
  });

  // Apply a circular layout to the graph, ordering nodes by label clockwise alphabetically
  let angleStep = -(2 * Math.PI) / sortedNodes.length; // Negative for clockwise
  sortedNodes.forEach((node, index) => {
    // Check if node type is 'category'
    if (graph.getNodeAttribute(node, "node_type") === "category") {
      // Skip this node and move to the next iteration
    } else {
      // Set the position for non-category nodes in a circular layout starting from 12 o'clock
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

  // Apply the ForceAtlas2 layout to the graph
  const settings = {
    iterations: 1000,
    settings: {
      gravity: 0.1,
      scalingRatio: 2.0,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      adjustSizes: false,
    },
  };
  forceAtlas2.assign(graph, settings);
  sigmaInstance.refresh();
}

export function calculateNodeColor(node) {
  if (node.hidden) {
    return rgbaToFloat(0, 0, 0, 0);
  }

  switch (node.node_type) {
    case "category":
      return "#0fc405";
    case "disease":
      return diseaseColor(clamp(node.allele_count, diseaseColor.domain()));

    case "allele":
      return "#e871fb";

    default:
      return "#000000";
  }
}

// Calculate the border size and colour based on the odds ratio
export function calculateBorder(node) {
  console.log(node)
  const color = calculateNodeColor(node);
  const baseSize =
    node.node_type === "allele"
      ? sizeScale(clamp(node.p, sizeScale.domain()))
      : 6;
  console.log(baseSize)

  // Calculate the border size based on the odds ratio
  let borderScaleFactor = 0.5;
  let oddsRatio = node.odds_ratio;
  let oddsRatioDeviation = Math.abs(oddsRatio - 1);
  let scaledBorderSize;

  if (oddsRatio >= 1) {
    scaledBorderSize = clamp(oddsRatioDeviation / 8, [0, 1]);
  } else {
    scaledBorderSize = clamp(1 / oddsRatio - 1, [0, 1]);
  }
  let finalBorderSize = baseSize * borderScaleFactor * scaledBorderSize;
  let borderSize = clamp(finalBorderSize, [0.5, baseSize * 0.5]);
  let borderColor = node.odds_ratio >= 1 ? "red" : "blue";
  return { color, baseSize, borderSize, borderColor };
}