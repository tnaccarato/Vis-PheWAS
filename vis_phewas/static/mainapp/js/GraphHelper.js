import forceAtlas2 from "graphology-layout-forceatlas2";
import { rgbaToFloat } from "sigma/utils";
import { clamp, diseaseColor, sizeScale } from "./utils";
import { filterManager } from "./main";
import {GraphManager} from "./GraphManager";

class GraphHelper {
  constructor(sigmaInstance, adjustSigmaContainerHeight) {
    this.sigmaInstance = sigmaInstance;
    this.adjustSigmaContainerHeight = adjustSigmaContainerHeight;
    this.graphManager = GraphManager;
  }

  clickedNode(graph, node, fetchGraphData, adjustSigmaContainerHeight, getInfoTable) {
    const nodeData = graph.getNodeAttributes(node);

    const removeChildrenNodes = (nodeId) => {
      const children = graph.outNeighbors(nodeId);
      children.forEach((child) => {
        if (graph.inNeighbors(child).length > 1) {
          const edge = graph.edges().find((edge) => {
            return graph.source(edge) === nodeId && graph.target(edge) === child;
          });
          graph.dropEdge(edge);
          return;
        }
        removeChildrenNodes(child);
        graph.dropNode(child);
      });
    };

    if (nodeData.node_type === "category") {
      if (nodeData.expanded) {
        removeChildrenNodes(node);
        nodeData.expanded = false;
      } else {
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
        removeChildrenNodes(node);
        nodeData.expanded = false;
      } else {
        fetchGraphData({
          type: "alleles",
          disease_id: encodeURIComponent(node),
          filters: filterManager.filters,
          clicked: true,
        });
        nodeData.expanded = true;
        nodeData.forceLabel = true;
      }
    } else if (nodeData.node_type === "allele") {
      const leftColumn = document.getElementsByClassName("col-md-6 left-column")[0];
      leftColumn.style.width = "70%";
      adjustSigmaContainerHeight();
      const rightColumn = document.getElementsByClassName("col-md-6 right-column")[0];
      rightColumn.style.width = "30%";
      rightColumn.style.display = "inline-block";
      const infoPanel = document.getElementsByClassName("info-container")[0];
      infoPanel.style.display = "inline-block";
      graph.nodes().forEach((n) => {
        if (graph.getNodeAttribute(n, "node_type") === "allele" && !n.userForceLabel) {
          graph.setNodeAttribute(n, "forceLabel", false);
        }
      });
      nodeData.forceLabel = true;
      getInfoTable(nodeData);
    }
  }

  hoverOnNode(node, graph) {
    const nodeId = node;
    const edges = graph.edges().filter((edge) => {
      return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    edges.forEach((edge) => {
      graph.setEdgeAttribute(edge, "color", "black");
    });

    if (this.sigmaInstance && typeof this.sigmaInstance.refresh === "function") {
      this.sigmaInstance.refresh();
    } else {
      console.error("Sigma instance or refresh method not available in hoverOnNode");
    }
  }

  hoverOffNode(node, graph) {
    if (!this.sigmaInstance || typeof this.sigmaInstance.refresh !== "function") {
      console.error("Sigma instance or refresh method not available in hoverOffNode");
      return;
    }

    const nodeId = node;
    const edges = graph.edges().filter((edge) => {
      return graph.source(edge) === nodeId || graph.target(edge) === nodeId;
    });

    edges.forEach((edge) => {
      graph.setEdgeAttribute(edge, "color", "darkgrey");
    });

    this.sigmaInstance.refresh();
  }

  applyLayout(graph) {
    const nodes = graph.nodes();
    const sortedNodes = nodes.sort((a, b) => {
      return graph.getNodeAttribute(a, "label").localeCompare(graph.getNodeAttribute(b, "label"));
    });

    let angleStep = -(2 * Math.PI) / sortedNodes.length;
    sortedNodes.forEach((node, index) => {
      if (graph.getNodeAttribute(node, "node_type") !== "category") {
        graph.setNodeAttribute(node, "x", 100 * Math.cos(Math.PI / 2 + angleStep * index));
        graph.setNodeAttribute(node, "y", 100 * Math.sin(Math.PI / 2 + angleStep * index));
      }
    });

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

  calculateNodeColor(node) {
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

  calculateBorder(node) {
    const color = this.calculateNodeColor(node);
    const baseSize = node.node_type === "allele" ? sizeScale(clamp(node.p, sizeScale.domain())) : 6;

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
}

export default GraphHelper;
